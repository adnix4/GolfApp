using GolfFundraiserPro.Api.Common.Middleware;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;
using SkiaSharp;
using Svg.Skia;

namespace GolfFundraiserPro.Api.Common.Images;

/// <summary>
/// Converts every logo we ingest to PNG.
///
/// WHY: React Native's &lt;Image&gt; cannot decode SVG or ICO on either platform.
/// It fails silently, so a sponsor logo in one of those formats renders as an
/// empty frame on the scorer while looking perfectly fine on web and admin,
/// where the browser handles both. That is exactly how the Scheels logo (an SVG
/// served by Cloudinary with no file extension) and the brand-extracted
/// "-fetched.ico" event logo reached production unnoticed.
///
/// PNG is the target because RN decodes it everywhere, it is lossless for flat
/// logo artwork, and — critically — it keeps the alpha channel. Sponsors supply
/// white-on-transparent logos constantly, and AdaptiveLogoFrame exists to put
/// those on a dark background. Flattening transparency here would silently
/// defeat that, so the conversion composites onto a TRANSPARENT canvas, never
/// onto white.
/// </summary>
public static class ImageNormalizer
{
    /// <summary>Content type every ingestion path stores.</summary>
    public const string PngContentType = "image/png";

    /// <summary>File extension matching <see cref="PngContentType"/>.</summary>
    public const string PngExtension = ".png";

    /// <summary>
    /// Longest edge of a stored logo. Logos render at ~120dp; 2048 leaves room
    /// for 3x displays and future layouts while bounding what we keep on disk.
    /// </summary>
    public const int MaxDimension = 2048;

    /// <summary>Width an SVG is rasterised at before the shared PNG path.</summary>
    private const int SvgRasterWidth = 1024;

    /// <summary>
    /// Every content type we can turn into a PNG. Wider than what the admin
    /// file pickers advertise on purpose: the picker steers organizers toward
    /// PNG, but a sponsor's SVG pasted as a URL still has to work.
    /// </summary>
    public static readonly string[] SupportedContentTypes =
    [
        "image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif",
        "image/bmp", "image/tiff", "image/svg+xml",
        "image/x-icon", "image/vnd.microsoft.icon",
    ];

    public static bool IsSupported(string? contentType) =>
        contentType is not null &&
        SupportedContentTypes.Contains(contentType.Trim().ToLowerInvariant());

    public static bool IsSvg(string? contentType) =>
        contentType?.Trim().ToLowerInvariant() is "image/svg+xml";

    /// <summary>
    /// Reads <paramref name="source"/> and returns PNG bytes.
    ///
    /// The caller owns the returned stream; it is positioned at 0 and safe to
    /// hand straight to IFileStorage.SaveAsync with <see cref="PngContentType"/>.
    /// Throws <see cref="ValidationException"/> for anything undecodable, with a
    /// message that names PNG so the organizer knows what to supply instead.
    /// </summary>
    public static async Task<MemoryStream> ToPngAsync(
        Stream source, string? contentType, CancellationToken ct = default)
    {
        // Buffer first: ImageSharp and Skia both need seekable input, and an
        // IFormFile or HTTP response stream is neither.
        var buffer = new MemoryStream();
        await source.CopyToAsync(buffer, ct);
        buffer.Position = 0;

        if (buffer.Length == 0)
            throw new ValidationException("Image is empty.");

        return IsSvg(contentType)
            ? RasterizeSvg(buffer)
            : Rescale(buffer, contentType);
    }

    /// <summary>
    /// ICO is the other format RN cannot decode, and ImageSharp cannot either —
    /// it arrives from brand extraction, which scrapes site favicons. Decoded by
    /// Skia, which handles it, then handed to the shared PNG path.
    /// </summary>
    private static MemoryStream Rescale(MemoryStream buffer, string? contentType)
    {
        Image<Rgba32> image;
        try
        {
            image = Image.Load<Rgba32>(buffer);
        }
        catch (Exception ex) when (ex is UnknownImageFormatException or InvalidImageContentException or NotSupportedException)
        {
            buffer.Position = 0;
            var viaSkia = TryDecodeWithSkia(buffer);
            if (viaSkia is null)
                throw new ValidationException(
                    $"Could not read this image{Describe(contentType)}. Please upload a PNG.");
            image = viaSkia;
        }

        using (image)
        {
            Downscale(image);
            return EncodePng(image);
        }
    }

    /// <summary>
    /// Rasterises an SVG onto a transparent canvas. Skia is the only piece here
    /// with native binaries; the Linux NoDependencies native asset keeps the
    /// runtime image free of extra apt packages.
    /// </summary>
    private static MemoryStream RasterizeSvg(MemoryStream buffer)
    {
        using var svg = new SKSvg();
        SKPicture? picture;
        try
        {
            picture = svg.Load(buffer);
        }
        catch (Exception ex) when (ex is not OutOfMemoryException)
        {
            throw new ValidationException(
                $"Could not read this SVG ({ex.GetType().Name}). Please upload a PNG instead.");
        }

        if (picture is null || picture.CullRect.Width <= 0 || picture.CullRect.Height <= 0)
            throw new ValidationException("Could not read this SVG. Please upload a PNG instead.");

        var rect  = picture.CullRect;
        var scale = SvgRasterWidth / rect.Width;
        var width = SvgRasterWidth;
        var height = Math.Max(1, (int)Math.Round(rect.Height * scale));

        using var bitmap = new SKBitmap(width, height, SKColorType.Rgba8888, SKAlphaType.Premul);
        using (var canvas = new SKCanvas(bitmap))
        {
            // Transparent, NOT white — a white-on-transparent sponsor logo has
            // to stay transparent so AdaptiveLogoFrame can put it on the dark
            // brand colour. Flattening here would make it invisible.
            canvas.Clear(SKColors.Transparent);
            canvas.Scale(scale);
            canvas.DrawPicture(picture);
        }

        using var image = Image.LoadPixelData<Rgba32>(bitmap.Bytes, bitmap.Width, bitmap.Height);
        Downscale(image);
        return EncodePng(image);
    }

    private static Image<Rgba32>? TryDecodeWithSkia(Stream input)
    {
        try
        {
            using var codec = SKCodec.Create(input);
            if (codec is null) return null;
            using var bitmap = SKBitmap.Decode(codec);
            if (bitmap is null) return null;

            using var rgba = bitmap.ColorType == SKColorType.Rgba8888
                ? bitmap.Copy()
                : bitmap.Copy(SKColorType.Rgba8888);
            return rgba is null
                ? null
                : Image.LoadPixelData<Rgba32>(rgba.Bytes, rgba.Width, rgba.Height);
        }
        catch
        {
            return null;
        }
    }

    private static void Downscale(Image<Rgba32> image)
    {
        var longest = Math.Max(image.Width, image.Height);
        if (longest <= MaxDimension) return;

        var ratio = (double)MaxDimension / longest;
        image.Mutate(x => x.Resize(
            Math.Max(1, (int)Math.Round(image.Width  * ratio)),
            Math.Max(1, (int)Math.Round(image.Height * ratio))));
    }

    private static MemoryStream EncodePng(Image<Rgba32> image)
    {
        var output = new MemoryStream();
        image.Save(output, new PngEncoder
        {
            // Rgba32 in, Rgba32 out — never drop the alpha channel.
            ColorType         = PngColorType.RgbWithAlpha,
            CompressionLevel  = PngCompressionLevel.BestCompression,
        });
        output.Position = 0;
        return output;
    }

    private static string Describe(string? contentType) =>
        string.IsNullOrWhiteSpace(contentType) ? string.Empty : $" ({contentType})";
}

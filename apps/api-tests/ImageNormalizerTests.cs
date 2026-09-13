using GolfFundraiserPro.Api.Common.Images;
using GolfFundraiserPro.Api.Common.Middleware;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using Xunit;

namespace GolfFundraiserPro.Api.Tests;

/// <summary>
/// The bug these exist to prevent: a sponsor logo that renders fine on web and
/// admin but draws an empty frame on the scorer, because React Native's Image
/// cannot decode SVG or ICO. Both fixtures here are the real files that caused
/// it — the Scheels SVG served by Cloudinary, and a brand-extracted favicon.
/// </summary>
public class ImageNormalizerTests
{
    private static readonly byte[] PngMagic = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

    private static string FixturePath(string name) =>
        Path.Combine(AppContext.BaseDirectory, "Fixtures", name);

    private static void AssertIsPng(MemoryStream png)
    {
        Assert.True(png.Length > 0);
        Assert.Equal(0, png.Position);
        var header = new byte[PngMagic.Length];
        png.ReadExactly(header);
        Assert.Equal(PngMagic, header);
        png.Position = 0;
    }

    /// <summary>A raster image with a genuinely transparent region.</summary>
    private static MemoryStream MakeRaster(string format, int width = 64, int height = 32)
    {
        using var img = new Image<Rgba32>(width, height);
        img[0, 0] = new Rgba32(255, 255, 255, 0);      // transparent pixel
        img[1, 0] = new Rgba32(218, 31, 51, 255);      // opaque pixel
        var ms = new MemoryStream();
        switch (format)
        {
            case "png":  img.SaveAsPng(ms);  break;
            case "jpeg": img.SaveAsJpeg(ms); break;
            case "webp": img.SaveAsWebp(ms); break;
            case "gif":  img.SaveAsGif(ms);  break;
            case "bmp":  img.SaveAsBmp(ms);  break;
            default: throw new ArgumentException(format);
        }
        ms.Position = 0;
        return ms;
    }

    [Theory]
    [InlineData("png",  "image/png")]
    [InlineData("jpeg", "image/jpeg")]
    [InlineData("webp", "image/webp")]
    [InlineData("gif",  "image/gif")]
    [InlineData("bmp",  "image/bmp")]
    public async Task Converts_every_raster_format_to_png(string format, string contentType)
    {
        using var source = MakeRaster(format);
        using var png = await ImageNormalizer.ToPngAsync(source, contentType);
        AssertIsPng(png);
    }

    // The exact file the scorer could not draw.
    [Fact]
    public async Task Rasterizes_the_scheels_svg()
    {
        await using var svg = File.OpenRead(FixturePath("scheels-logo.svg"));
        using var png = await ImageNormalizer.ToPngAsync(svg, "image/svg+xml");
        AssertIsPng(png);

        using var decoded = Image.Load<Rgba32>(png);
        Assert.True(decoded.Width  > 1);
        Assert.True(decoded.Height > 1);
        // 322x71.8 viewBox rasterised at 1024 wide keeps its aspect ratio.
        Assert.InRange(decoded.Width / (double)decoded.Height, 4.0, 5.0);
    }

    // ICO is the other format RN cannot decode; brand extraction produces them
    // by scraping site favicons.
    [Fact]
    public async Task Converts_a_favicon_ico()
    {
        await using var ico = File.OpenRead(FixturePath("favicon.ico"));
        using var png = await ImageNormalizer.ToPngAsync(ico, "image/x-icon");
        AssertIsPng(png);
    }

    /// <summary>
    /// The whole point of AdaptiveLogoFrame is putting white-on-transparent
    /// sponsor logos on a dark background. Flattening alpha during conversion
    /// would make those invisible in a way no test of the frame itself catches.
    /// </summary>
    [Fact]
    public async Task Preserves_transparency()
    {
        using var source = MakeRaster("png");
        using var png = await ImageNormalizer.ToPngAsync(source, "image/png");

        using var decoded = Image.Load<Rgba32>(png);
        Assert.Equal(0, decoded[0, 0].A);       // still transparent
        Assert.Equal(255, decoded[1, 0].A);     // still opaque
    }

    [Fact]
    public async Task Svg_rasterizes_onto_transparency_not_white()
    {
        // A shape filling only the left half; the right half must stay clear.
        const string svg = """
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50">
              <rect x="0" y="0" width="50" height="50" fill="#1c1d1d"/>
            </svg>
            """;
        using var source = new MemoryStream(System.Text.Encoding.UTF8.GetBytes(svg));
        using var png = await ImageNormalizer.ToPngAsync(source, "image/svg+xml");

        using var decoded = Image.Load<Rgba32>(png);
        Assert.Equal(0, decoded[decoded.Width - 2, decoded.Height / 2].A);   // clear
        Assert.Equal(255, decoded[2, decoded.Height / 2].A);                 // drawn
    }

    [Fact]
    public async Task Caps_the_longest_edge()
    {
        using var source = MakeRaster("png", width: 4000, height: 1000);
        using var png = await ImageNormalizer.ToPngAsync(source, "image/png");

        using var decoded = Image.Load<Rgba32>(png);
        Assert.Equal(ImageNormalizer.MaxDimension, decoded.Width);
        Assert.Equal(512, decoded.Height);       // aspect ratio kept
    }

    [Fact]
    public async Task Leaves_a_small_image_alone()
    {
        using var source = MakeRaster("png", width: 120, height: 40);
        using var png = await ImageNormalizer.ToPngAsync(source, "image/png");

        using var decoded = Image.Load<Rgba32>(png);
        Assert.Equal(120, decoded.Width);
        Assert.Equal(40,  decoded.Height);
    }

    [Fact]
    public async Task Rejects_a_non_image_with_a_message_naming_png()
    {
        using var source = new MemoryStream("this is not an image"u8.ToArray());
        var ex = await Assert.ThrowsAsync<ValidationException>(
            () => ImageNormalizer.ToPngAsync(source, "image/png"));
        Assert.Contains("PNG", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Rejects_an_empty_stream()
    {
        using var source = new MemoryStream();
        await Assert.ThrowsAsync<ValidationException>(
            () => ImageNormalizer.ToPngAsync(source, "image/png"));
    }

    [Theory]
    [InlineData("image/svg+xml", true)]
    [InlineData("image/x-icon", true)]
    [InlineData("IMAGE/PNG", true)]
    [InlineData("application/pdf", false)]
    [InlineData(null, false)]
    public void Reports_what_it_supports(string? contentType, bool expected) =>
        Assert.Equal(expected, ImageNormalizer.IsSupported(contentType));
}

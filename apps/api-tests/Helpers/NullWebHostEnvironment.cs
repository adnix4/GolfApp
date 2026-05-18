using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.FileProviders;

namespace WebAPI.Tests.Helpers;

/// <summary>Minimal IWebHostEnvironment stub — only WebRootPath is needed by AuctionService.UploadPhotoAsync.</summary>
public sealed class NullWebHostEnvironment : IWebHostEnvironment
{
    public string WebRootPath { get; set; } = Path.GetTempPath();
    public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider();
    public string ApplicationName { get; set; } = "Test";
    public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    public string ContentRootPath { get; set; } = Path.GetTempPath();
    public string EnvironmentName { get; set; } = "Testing";
}

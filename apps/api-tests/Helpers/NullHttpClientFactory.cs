namespace WebAPI.Tests.Helpers;

/// <summary>No-op IHttpClientFactory stub — never actually sends HTTP in tests.</summary>
public sealed class NullHttpClientFactory : IHttpClientFactory
{
    public HttpClient CreateClient(string name) => new();
}

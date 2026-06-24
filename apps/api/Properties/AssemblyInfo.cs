using System.Runtime.CompilerServices;

// Exposes internal helpers (e.g. BrandExtractionService.ParseSignals /
// NormalizeUrl) to the test project so the HTML-parsing and URL-validation
// logic can be unit-tested without making them part of the public surface.
[assembly: InternalsVisibleTo("WebAPI.Tests")]

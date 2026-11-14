using System.Text.RegularExpressions;
using FormBuilder.Mvc.Api;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace FormBuilder.Mvc.Tests;

/// <summary>Hosts the MVC site in memory; its API client talks to <see cref="StubApi"/> instead of the real API.</summary>
public sealed partial class MvcFactory : WebApplicationFactory<Program>
{
    public StubApi Api { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.ConfigureTestServices(services =>
            services.AddHttpClient<ApiClient>().ConfigurePrimaryHttpMessageHandler(() => Api));
    }

    /// <summary>A browser-like client: keeps cookies, does not follow redirects.</summary>
    public HttpClient Browser() =>
        CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false, HandleCookies = true });

    /// <summary>Signs in through the real login form (with its anti-forgery token) and returns the client.</summary>
    public async Task<HttpClient> SignedInAsync(string username, string password)
    {
        var client = Browser();
        var response = await PostLoginAsync(client, username, password);
        if (response.StatusCode != System.Net.HttpStatusCode.Redirect)
            throw new InvalidOperationException($"Login failed: {response.StatusCode}");
        return client;
    }

    public static async Task<HttpResponseMessage> PostLoginAsync(HttpClient client, string username, string password, string? returnUrl = null)
    {
        var page = await client.GetStringAsync("/Account/Login");
        var token = FormToken().Match(page).Groups[1].Value;
        return await client.PostAsync("/Account/Login", new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["Username"] = username,
            ["Password"] = password,
            ["ReturnUrl"] = returnUrl ?? "",
            ["__RequestVerificationToken"] = token
        }));
    }

    /// <summary>The token the layout puts in &lt;meta name="csrf-token"&gt; for jQuery.</summary>
    public static async Task<string> AjaxTokenAsync(HttpClient client)
    {
        var page = await client.GetStringAsync("/Forms");
        return MetaToken().Match(page).Groups[1].Value;
    }

    [GeneratedRegex("name=\"__RequestVerificationToken\" type=\"hidden\" value=\"([^\"]+)\"")]
    private static partial Regex FormToken();

    [GeneratedRegex("<meta name=\"csrf-token\" content=\"([^\"]+)\"")]
    private static partial Regex MetaToken();
}

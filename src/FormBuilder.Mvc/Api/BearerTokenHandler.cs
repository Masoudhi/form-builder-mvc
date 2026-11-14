using System.Net.Http.Headers;
using Microsoft.AspNetCore.Authentication;

namespace FormBuilder.Mvc.Api;

/// <summary>
/// Adds "Authorization: Bearer &lt;jwt&gt;" to API calls. The token is kept inside the encrypted,
/// HttpOnly authentication cookie, so browser scripts never see it.
/// </summary>
public sealed class BearerTokenHandler(IHttpContextAccessor accessor) : DelegatingHandler
{
    public const string TokenName = "access_token";

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var context = accessor.HttpContext;
        if (context?.User.Identity?.IsAuthenticated == true)
        {
            var token = await context.GetTokenAsync(TokenName);
            if (!string.IsNullOrEmpty(token))
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        }
        return await base.SendAsync(request, cancellationToken);
    }
}

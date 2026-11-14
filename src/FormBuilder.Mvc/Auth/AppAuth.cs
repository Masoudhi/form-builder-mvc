using System.Security.Claims;
using FormBuilder.Mvc.Api;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;

namespace FormBuilder.Mvc.Auth;

public static class AppAuth
{
    /// <summary>Users with level 100 or higher may design forms and see submissions.</summary>
    public const string FormCreatorPolicy = "FormCreator";
    public const int FormCreatorLevel = 100;

    public const string LevelClaim = "level";
    public const string DisplayNameClaim = "display_name";

    public static void AddPolicies(AuthorizationOptions options)
    {
        // Every page needs a signed-in user unless it says [AllowAnonymous]
        options.FallbackPolicy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build();
        options.AddPolicy(FormCreatorPolicy, p => p.RequireAuthenticatedUser().RequireAssertion(c => c.User.Level() >= FormCreatorLevel));
    }

    public static int Level(this ClaimsPrincipal user) =>
        int.TryParse(user.FindFirstValue(LevelClaim), out var level) ? level : 0;

    public static bool CanCreateForms(this ClaimsPrincipal user) => user.Level() >= FormCreatorLevel;

    public static string DisplayName(this ClaimsPrincipal user) =>
        user.FindFirstValue(DisplayNameClaim) ?? user.Identity?.Name ?? "";

    /// <summary>Signs in with a cookie that carries the user's claims and the API's JWT (encrypted).</summary>
    public static Task SignInAsync(HttpContext context, LoginResult login)
    {
        var identity = new ClaimsIdentity(
        [
            new Claim(ClaimTypes.NameIdentifier, login.User.Id.ToString()),
            new Claim(ClaimTypes.Name, login.User.Username),
            new Claim(DisplayNameClaim, login.User.DisplayName),
            new Claim(LevelClaim, login.User.Level.ToString()),
            new Claim(ClaimTypes.Role, login.User.CanCreateForms ? "FormCreator" : "User")
        ], CookieAuthenticationDefaults.AuthenticationScheme);

        var properties = new AuthenticationProperties
        {
            IsPersistent = false,
            ExpiresUtc = DateTime.SpecifyKind(login.ExpiresAt, DateTimeKind.Utc),   // the cookie ends with the token
            AllowRefresh = false
        };
        properties.StoreTokens([new AuthenticationToken { Name = BearerTokenHandler.TokenName, Value = login.AccessToken }]);

        return context.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(identity), properties);
    }

    /// <summary>AJAX requests get 401/403 instead of a redirect to the login page.</summary>
    public static bool IsAjax(this HttpRequest request) =>
        request.Headers.XRequestedWith == "XMLHttpRequest" || request.Path.StartsWithSegments("/ajax");
}

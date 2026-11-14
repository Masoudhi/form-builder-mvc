using FormBuilder.Mvc.Api;
using FormBuilder.Mvc.Auth;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Mvc;

var builder = WebApplication.CreateBuilder(args);

// ---- MVC: anti-forgery on every POST (jQuery sends the token in a header) ----
builder.Services.AddControllersWithViews(o => o.Filters.Add(new AutoValidateAntiforgeryTokenAttribute()));
builder.Services.AddAntiforgery(o =>
{
    o.HeaderName = "RequestVerificationToken";
    o.Cookie.Name = "fb.af";
});

// ---- Typed client for form-builder-api (no database access in this app) ----
var api = builder.Configuration.GetSection(ApiOptions.Section).Get<ApiOptions>() ?? new ApiOptions();
builder.Services.AddHttpContextAccessor();
builder.Services.AddTransient<BearerTokenHandler>();
builder.Services
    .AddHttpClient<ApiClient>(c =>
    {
        c.BaseAddress = new Uri(api.BaseUrl);
        c.Timeout = TimeSpan.FromSeconds(30);
    })
    .AddHttpMessageHandler<BearerTokenHandler>();

// ---- Cookie sign-in holding the API's JWT; level 100 policy ----
builder.Services
    .AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(o =>
    {
        o.Cookie.Name = "fb.auth";
        o.Cookie.HttpOnly = true;
        o.Cookie.SameSite = SameSiteMode.Lax;
        o.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
        o.LoginPath = "/Account/Login";
        o.AccessDeniedPath = "/Account/AccessDenied";
        o.SlidingExpiration = false;

        // jQuery calls get a status code instead of an HTML redirect
        o.Events.OnRedirectToLogin = context => AjaxOrRedirect(context.HttpContext, context.RedirectUri, StatusCodes.Status401Unauthorized);
        o.Events.OnRedirectToAccessDenied = context => AjaxOrRedirect(context.HttpContext, context.RedirectUri, StatusCodes.Status403Forbidden);
    });
builder.Services.AddAuthorization(AppAuth.AddPolicies);

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/error");
    app.UseHsts();
}

app.Use(async (context, next) =>
{
    var headers = context.Response.Headers;
    headers.XContentTypeOptions = "nosniff";
    headers.XFrameOptions = "DENY";
    headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
    await next();
});

app.UseStaticFiles();
app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllerRoute(name: "default", pattern: "{controller=Forms}/{action=Index}/{id?}");

app.Run();

static Task AjaxOrRedirect(HttpContext context, string redirectUri, int status)
{
    if (context.Request.IsAjax())
        context.Response.StatusCode = status;
    else
        context.Response.Redirect(redirectUri);
    return Task.CompletedTask;
}

/// <summary>Entry point; public so the tests can host the site in memory.</summary>
public partial class Program;

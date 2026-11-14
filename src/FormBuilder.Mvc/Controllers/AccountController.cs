using System.ComponentModel.DataAnnotations;
using FormBuilder.Mvc.Api;
using FormBuilder.Mvc.Auth;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace FormBuilder.Mvc.Controllers;

public sealed class LoginViewModel
{
    [Required(ErrorMessage = "Enter your username.")]
    [StringLength(50)]
    public string Username { get; set; } = string.Empty;

    [Required(ErrorMessage = "Enter your password.")]
    [DataType(DataType.Password)]
    public string Password { get; set; } = string.Empty;

    public string? ReturnUrl { get; set; }
}

public sealed class AccountController(ApiClient api) : Controller
{
    [HttpGet]
    [AllowAnonymous]
    public IActionResult Login(string? returnUrl = null)
    {
        if (User.Identity?.IsAuthenticated == true)
            return RedirectToLocal(returnUrl);
        return View(new LoginViewModel { ReturnUrl = returnUrl });
    }

    [HttpPost]
    [AllowAnonymous]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Login(LoginViewModel model)
    {
        if (!ModelState.IsValid)
            return View(model);

        var (outcome, result) = await api.LoginAsync(model.Username.Trim(), model.Password, HttpContext.RequestAborted);
        switch (outcome)
        {
            case LoginOutcome.Success:
                await AppAuth.SignInAsync(HttpContext, result!);
                return RedirectToLocal(model.ReturnUrl);
            case LoginOutcome.TooManyAttempts:
                ModelState.AddModelError(string.Empty, "Too many sign-in attempts. Wait a minute and try again.");
                break;
            case LoginOutcome.ApiUnavailable:
                ModelState.AddModelError(string.Empty, "The Form Builder API is not reachable. Make sure it is running.");
                break;
            default:
                ModelState.AddModelError(string.Empty, "Invalid username or password.");
                break;
        }

        model.Password = string.Empty;
        return View(model);
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Logout()
    {
        await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        return RedirectToAction(nameof(Login));
    }

    [HttpGet]
    public IActionResult AccessDenied() => View();

    /// <summary>Only redirects inside this site (prevents open redirects through ?returnUrl=).</summary>
    private IActionResult RedirectToLocal(string? returnUrl) =>
        Url.IsLocalUrl(returnUrl) ? LocalRedirect(returnUrl) : RedirectToAction("Index", "Forms");
}

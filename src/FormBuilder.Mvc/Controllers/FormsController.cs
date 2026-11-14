using FormBuilder.Mvc.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace FormBuilder.Mvc.Controllers;

/// <summary>Pages. Each view loads its data with jQuery from the /ajax endpoints.</summary>
public sealed class FormsController : Controller
{
    public IActionResult Index() => View();

    [Authorize(Policy = AppAuth.FormCreatorPolicy)]
    public IActionResult Builder(int? id) => View(model: id);

    public IActionResult Fill(int id) => View(model: id);

    [Authorize(Policy = AppAuth.FormCreatorPolicy)]
    public IActionResult Submissions(int id) => View(model: id);

    [AllowAnonymous]
    [Route("/error")]
    public IActionResult Error() => View();
}

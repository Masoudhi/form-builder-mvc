/* Fill in a published form */
(function ($, fb) {
    'use strict';

    var $root = $('#fill');
    var formId = $root.data('form-id');
    var form = null;

    function showForm() {
        $root.html(
            '<form class="card sheet" novalidate>' +
            '<header><h1 class="h3">' + fb.esc(form.name) + '</h1>' +
            (form.description ? '<p class="text-muted mb-0">' + fb.esc(form.description) + '</p>' : '') + '</header>' +
            (form.isPublished ? '' : '<div class="alert alert-warning mb-0">This form is a draft. Publish it in the builder before collecting answers.</div>') +
            '<div class="form-errors"></div>' +
            '<div class="fields"></div>' +
            '<footer><span class="text-muted small"><span class="req">*</span> required</span>' +
            '<button type="submit" class="btn btn-primary px-4"' + (form.isPublished ? '' : ' disabled') + '>Submit</button></footer>' +
            '</form>');
        fb.renderer.render($root.find('.fields'), form.fields, 'fill');
    }

    function showThanks() {
        $root.html(
            '<section class="card done text-center">' +
            '<div class="tick" aria-hidden="true">✓</div>' +
            '<h1 class="h3">Thank you!</h1>' +
            '<p class="text-muted">Your answers to "' + fb.esc(form.name) + '" were saved.</p>' +
            '<div class="d-flex gap-2 justify-content-center flex-wrap">' +
            '<button type="button" class="btn btn-outline-secondary js-again">Submit another response</button>' +
            (fb.canCreate ? '<a class="btn btn-primary" href="/Forms/Submissions/' + form.id + '">View submissions</a>' : '<a class="btn btn-primary" href="/Forms">Back to forms</a>') +
            '</div></section>');
    }

    $root.on('submit', 'form', function (e) {
        e.preventDefault();
        var $form = $(this);
        var $fields = $form.find('.fields');
        var answers = fb.renderer.read($fields, form.fields);
        $form.find('.form-errors').empty();

        // Instant feedback in the browser; the API validates again on submit
        var clientErrors = fb.renderer.validate(form.fields, answers);
        if (!$.isEmptyObject(clientErrors)) {
            fb.renderer.showErrors($fields, clientErrors);
            return;
        }

        var $btn = $form.find('button[type=submit]').prop('disabled', true).text('Submitting…');
        fb.api('POST', '/ajax/forms/' + formId + '/submit', { answers: answers })
            .done(showThanks)
            .fail(function (xhr) {
                var p = fb.problem(xhr);
                var unmatched = fb.renderer.showErrors($fields, p.errors);
                var messages = unmatched.length ? unmatched : ($.isEmptyObject(p.errors) ? [p.message] : []);
                if (messages.length)
                    $form.find('.form-errors').html('<div class="alert alert-danger">' + $.map(messages, fb.esc).join('<br>') + '</div>');
                $btn.prop('disabled', false).text('Submit');
            });
    });

    // Clear a field's error as soon as the user changes it
    $root.on('input change', '.field input, .field select, .field textarea', function () {
        var $field = $(this).closest('.field');
        $field.removeClass('has-error').find('[data-error-for]').text('');
        $field.find('.is-invalid').removeClass('is-invalid');
    });

    $root.on('click', '.js-again', showForm);

    fb.api('GET', '/ajax/forms/' + formId)
        .done(function (f) { form = f; document.title = f.name + ' · Form Builder'; showForm(); })
        .fail(function (xhr) {
            $root.html('<div class="alert alert-danger">' + fb.esc(fb.problem(xhr).message) + ' <a href="/Forms" class="alert-link">Back to forms</a></div>');
        });
})(jQuery, window.fb);

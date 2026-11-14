/* Form Builder – shared jQuery helpers (window.fb) */
window.fb = (function ($) {
    'use strict';

    // Every AJAX call carries the anti-forgery token from the layout's <meta name="csrf-token">
    $.ajaxSetup({
        headers: { 'RequestVerificationToken': $('meta[name="csrf-token"]').attr('content') },
        cache: false
    });

    // The session (JWT) ended: go to the sign-in page and come back afterwards
    $(document).ajaxError(function (_event, xhr) {
        if (xhr.status === 401) {
            window.location.href = '/Account/Login?ReturnUrl=' + encodeURIComponent(location.pathname + location.search);
        }
    });

    /** JSON call to one of the /ajax endpoints. Returns a jQuery promise. */
    function api(method, url, data) {
        return $.ajax({
            url: url,
            method: method,
            contentType: 'application/json; charset=utf-8',
            data: data === undefined ? undefined : JSON.stringify(data),
            dataType: 'json'
        });
    }

    /** Reads an RFC 7807 problem response: { message, errors: { field: [messages] } }. */
    function problem(xhr) {
        var body = xhr && xhr.responseJSON;
        var errors = (body && body.errors) || {};
        var message;
        if (!xhr || xhr.status === 0) message = 'Cannot reach the server. Check your connection.';
        else if (xhr.status === 403) message = 'You do not have permission to do that.';
        else if (xhr.status === 404) message = 'This item no longer exists.';
        else if (xhr.status === 409) message = (body && body.detail) || 'Someone else changed this first.';
        else if (xhr.status === 502) message = 'The Form Builder API is not reachable.';
        else if (xhr.status === 400) message = 'Please correct the highlighted fields.';
        else message = (body && (body.detail || body.title)) || 'Something went wrong (' + xhr.status + ').';
        return { message: message, errors: errors, status: xhr ? xhr.status : 0 };
    }

    /** Escapes text for safe use inside HTML (all user content goes through this). */
    function esc(value) {
        return String(value === null || value === undefined ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function toast(kind, text) {
        var $t = $('<div class="toast-msg" role="status"></div>')
            .toggleClass('toast-error', kind === 'error')
            .append($('<span></span>').text(text))
            .append('<button type="button" class="btn-close btn-close-white btn-sm" aria-label="Dismiss"></button>');
        $t.on('click', 'button', function () { $t.remove(); });
        $('.toasts').append($t);
        setTimeout(function () { $t.fadeOut(200, function () { $t.remove(); }); }, 4000);
    }

    function formatDate(iso) {
        var d = new Date(iso);
        return isNaN(d) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    }

    function formatDateTime(iso) {
        var d = new Date(iso);
        return isNaN(d) ? '' : d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    return {
        api: api,
        problem: problem,
        esc: esc,
        toast: toast,
        formatDate: formatDate,
        formatDateTime: formatDateTime,
        canCreate: $('body').data('can-create') === true
    };
})(jQuery);

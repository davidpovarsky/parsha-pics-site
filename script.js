(() => {
  'use strict';
  const dialogs = {
    trial: document.getElementById('trialDialog'),
    pricing: document.getElementById('pricingDialog'),
    contact: document.getElementById('contactDialog')
  };
  const leadCaptureEnabled = document.body.dataset.leadCapture === 'enabled';
  const turnstileSiteKey = document.body.dataset.turnstileSiteKey || '';
  const turnstileWidgets = new Map();
  let returnFocus = null;

  const renderTurnstileWidgets = () => {
    if (!leadCaptureEnabled || !turnstileSiteKey || !window.turnstile) return;
    for (const form of document.querySelectorAll('.lead-form')) {
      if (turnstileWidgets.has(form)) continue;
      const slot = form.querySelector('[data-turnstile]');
      if (!slot) continue;
      const widgetId = window.turnstile.render(slot, {
        sitekey: turnstileSiteKey,
        action: `lead_${form.dataset.type}`,
        theme: 'auto',
        'response-field': false
      });
      turnstileWidgets.set(form, widgetId);
    }
  };
  window.onTurnstileLoad = renderTurnstileWidgets;

  const openDialog = (key) => {
    const dialog = dialogs[key];
    if (!dialog || dialog.open) return;
    returnFocus = document.activeElement;
    dialog.showModal();
    dialog.querySelector('input:not(.honeypot)')?.focus();
  };
  for (const trigger of document.querySelectorAll('[data-open]')) {
    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      openDialog(trigger.dataset.open);
    });
  }
  for (const dialog of Object.values(dialogs)) {
    if (!dialog) continue;
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
    dialog.querySelector('[data-close]')?.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
      if (returnFocus instanceof HTMLElement) returnFocus.focus();
    });
  }

  const pricingForm = document.querySelector('[data-type="pricing"]');
  if (pricingForm) {
    const boxes = [...pricingForm.querySelectorAll('input[name="sefarim"]')];
    const full = boxes.find((input) => input.value === 'Full collection');
    boxes.forEach((box) => box.addEventListener('change', () => {
      if (box === full && box.checked) boxes.filter((item) => item !== full).forEach((item) => item.checked = false);
      else if (box !== full && box.checked && full) full.checked = false;
    }));
  }

  for (const details of document.querySelectorAll('.faq-list details')) {
    details.addEventListener('toggle', () => {
      if (!details.open) return;
      for (const sibling of document.querySelectorAll('.faq-list details[open]')) {
        if (sibling !== details) sibling.open = false;
      }
    });
  }

  for (const form of document.querySelectorAll('.lead-form')) {
    const initialStatus = form.querySelector('.form-status');
    const submitButton = form.querySelector('button[type="submit"]');
    if (!leadCaptureEnabled) {
      submitButton.disabled = true;
      initialStatus.dataset.state = 'review';
      initialStatus.textContent = 'Preview only — submissions will open after the privacy notice and email route are approved.';
    }
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const status = form.querySelector('.form-status');
      const button = form.querySelector('button[type="submit"]');
      if (!leadCaptureEnabled) return;
      const previousText = button.innerHTML;
      const data = new FormData(form);
      const type = form.dataset.type;
      if (type === 'pricing' && !data.getAll('sefarim').length) {
        status.dataset.state = 'error';
        status.textContent = 'Please select at least one Sefer or the full collection.';
        return;
      }
      const widgetId = turnstileWidgets.get(form);
      const turnstileToken = widgetId === undefined || !window.turnstile
        ? ''
        : window.turnstile.getResponse(widgetId);
      if (!turnstileToken) {
        status.dataset.state = 'error';
        status.textContent = 'Please complete the verification and try again.';
        return;
      }
      const payload = {
        type,
        name: String(data.get('name') || '').trim(),
        email: String(data.get('email') || '').trim(),
        school: String(data.get('school') || '').trim(),
        website: String(data.get('website') || ''),
        message: String(data.get('message') || '').trim(),
        sefarim: data.getAll('sefarim'),
        turnstileToken
      };
      status.textContent = 'Sending your request...';
      status.dataset.state = 'loading';
      button.disabled = true;
      button.textContent = 'Sending...';
      try {
        const response = await fetch('/api/lead', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(payload)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) throw new Error(result.error || 'Unable to send your request right now.');
        status.dataset.state = 'success';
        status.textContent = type === 'trial'
          ? 'Thank you! Your request has been sent. The Parsha Pics team will follow up by email.'
          : 'Thank you! Your message has been sent.';
        form.reset();
      } catch (err) {
        status.dataset.state = 'error';
        status.textContent = err.message || 'Something went wrong. Please try again.';
      } finally {
        if (widgetId !== undefined && window.turnstile) window.turnstile.reset(widgetId);
        button.disabled = false;
        button.innerHTML = previousText;
      }
    });
  }

  renderTurnstileWidgets();

  for (const image of document.querySelectorAll('img')) {
    image.addEventListener('error', () => {
      image.dataset.missingAsset = 'true';
      if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
        console.warn('Missing source asset:', image.getAttribute('src'));
      }
    });
  }

  const requestedDialog = new URLSearchParams(location.search).get('dialog');
  if (requestedDialog && dialogs[requestedDialog]) openDialog(requestedDialog);
})();

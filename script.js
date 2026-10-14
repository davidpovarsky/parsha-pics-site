(() => {
  'use strict';
  const dialogs = {
    trial: document.getElementById('trialDialog'),
    pricing: document.getElementById('pricingDialog'),
    contact: document.getElementById('contactDialog'),
    lightbox: document.getElementById('lightboxDialog')
  };
  const leadCaptureEnabled = document.body.dataset.leadCapture === 'enabled';
  const turnstileSiteKey = document.body.dataset.turnstileSiteKey || '';
  const turnstileWidgets = new Map();
  let returnFocus = null;

  const renderTurnstileWidgets = () => {
    if (!leadCaptureEnabled || !turnstileSiteKey || !window.turnstile) return;
    for (const form of document.querySelectorAll('.lead-form')) {
      if (turnstileWidgets.has(form)) continue;
      const dialog = form.closest('dialog');
      if (dialog && !dialog.open) continue;
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
    renderTurnstileWidgets();
  };
  for (const trigger of document.querySelectorAll('[data-open]')) {
    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      openDialog(trigger.dataset.open);
    });
  }
  for (const [key, dialog] of Object.entries(dialogs)) {
    if (!dialog || key === 'lightbox') continue;
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
    dialog.querySelector('[data-close]')?.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
      if (returnFocus instanceof HTMLElement) returnFocus.focus();
    });
  }

  // Pricing form exclusive choices
  const pricingForm = document.querySelector('[data-type="pricing"]');
  if (pricingForm) {
    const boxes = [...pricingForm.querySelectorAll('input[name="sefarim"]')];
    const full = boxes.find((input) => input.value === 'Full collection');
    boxes.forEach((box) => box.addEventListener('change', () => {
      if (box === full && box.checked) boxes.filter((item) => item !== full).forEach((item) => item.checked = false);
      else if (box !== full && box.checked && full) full.checked = false;
    }));
  }

  // FAQ exclusive open toggle
  for (const details of document.querySelectorAll('.faq-list details')) {
    details.addEventListener('toggle', () => {
      if (!details.open) return;
      for (const sibling of document.querySelectorAll('.faq-list details[open]')) {
        if (sibling !== details) sibling.open = false;
      }
    });
  }

  // Helper for native browser download
  const triggerNativeDownload = (url, filename) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || 'Lech-Lecha-Parsha-Pics-Sample.zip';
    link.rel = 'noopener noreferrer';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => link.remove(), 1500);
  };

  // Lead forms handling
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
      const fallbackArea = form.querySelector('.trial-download-fallback');
      if (fallbackArea) fallbackArea.style.display = 'none';

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
      const honeypotInput = form.querySelector('.honeypot');
      if (honeypotInput) honeypotInput.value = '';

      const payload = {
        type,
        name: String(data.get('name') || '').trim(),
        email: String(data.get('email') || '').trim(),
        school: String(data.get('school') || '').trim(),
        website: '',
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

        if (type === 'trial' && result.download && result.download.url) {
          status.textContent = "Thank you! Your request has been sent. Your Lech Lecha sample should start downloading automatically. If it doesn't, select Download sample below.";

          if (fallbackArea) {
            fallbackArea.style.display = 'block';
            const downloadBtn = fallbackArea.querySelector('.download-btn');
            if (downloadBtn) {
              downloadBtn.href = result.download.url;
              downloadBtn.download = result.download.filename || 'Lech-Lecha-Parsha-Pics-Sample.zip';
              downloadBtn.target = '_blank';
              downloadBtn.rel = 'noopener noreferrer';
              downloadBtn.onclick = null;
            }
          }

          try {
            triggerNativeDownload(result.download.url, result.download.filename);
          } catch (autoErr) {
            console.warn('Programmatic download trigger:', autoErr);
          }
        } else if (type === 'trial') {
          status.textContent = 'Thank you! Your request has been sent. The Parsha Pics team will follow up by email.';
        } else {
          status.textContent = 'Thank you! Your message has been sent.';
        }
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

  // Lightbox Implementation
  const lightboxDialog = document.getElementById('lightboxDialog');
  if (lightboxDialog) {
    const lightboxImg = document.getElementById('lightboxImg');
    const lightboxTitle = document.getElementById('lightboxTitle');
    const lightboxCounter = document.getElementById('lightboxCounter');
    const closeBtn = lightboxDialog.querySelector('[data-lightbox-close]');
    const prevBtn = lightboxDialog.querySelector('[data-lightbox-prev]');
    const nextBtn = lightboxDialog.querySelector('[data-lightbox-next]');

    // Gather galleries
    const galleries = {
      sequence: [],
      vayeishev: [],
      mishpatim: [],
      kedoshim: []
    };

    // Sequence items
    document.querySelectorAll('.sequence-card').forEach((card, idx) => {
      const img = card.querySelector('img');
      const caption = card.querySelector('figcaption')?.textContent?.trim() || `Scene ${idx + 1}`;
      if (img) {
        galleries.sequence.push({
          src: img.getAttribute('src'),
          alt: img.getAttribute('alt') || caption,
          title: `${idx + 1}. ${caption}`,
          counter: `${idx + 1} / 9`
        });
      }
    });

    // Collection items helper
    const buildCollectionGallery = (key, name) => {
      const card = document.querySelector(`.collection-card:has([data-lightbox="${key}"])`)
        || [...document.querySelectorAll('.collection-card')].find((c) => c.querySelector(`[data-lightbox="${key}"]`));
      if (!card) return;
      const triggers = card.querySelectorAll(`[data-lightbox="${key}"]`);
      triggers.forEach((trigger, idx) => {
        const img = trigger.querySelector('img');
        if (img) {
          galleries[key].push({
            src: img.getAttribute('src'),
            alt: img.getAttribute('alt') || `${name} scene ${idx + 1}`,
            title: `${name} &ndash; Scene ${idx + 1} of 4`,
            counter: `${idx + 1} / 4`
          });
        }
      });
    };

    buildCollectionGallery('vayeishev', 'Vayeishev');
    buildCollectionGallery('mishpatim', 'Mishpatim');
    buildCollectionGallery('kedoshim', 'Kedoshim');

    let currentGalleryName = 'sequence';
    let currentIndex = 0;
    let lightboxReturnFocus = null;

    const renderCurrentItem = () => {
      const list = galleries[currentGalleryName] || [];
      if (!list.length) return;
      const item = list[currentIndex];
      lightboxImg.src = item.src;
      lightboxImg.alt = item.alt;
      lightboxTitle.innerHTML = item.title;
      lightboxCounter.textContent = `${currentIndex + 1} / ${list.length}`;
    };

    const navigate = (delta) => {
      const list = galleries[currentGalleryName] || [];
      if (!list.length) return;
      currentIndex = (currentIndex + delta + list.length) % list.length;
      renderCurrentItem();
    };

    const openLightbox = (galleryName, index) => {
      if (!galleries[galleryName] || !galleries[galleryName].length) return;
      currentGalleryName = galleryName;
      currentIndex = Math.max(0, Math.min(index, galleries[galleryName].length - 1));
      lightboxReturnFocus = document.activeElement;
      renderCurrentItem();
      lightboxDialog.showModal();
      closeBtn?.focus();
    };

    // Trigger clicks
    document.querySelectorAll('[data-lightbox]').forEach((trigger) => {
      trigger.addEventListener('click', (e) => {
        e.preventDefault();
        const gallery = trigger.dataset.lightbox;
        const index = parseInt(trigger.dataset.index, 10) || 0;
        openLightbox(gallery, index);
      });
    });

    prevBtn?.addEventListener('click', () => navigate(-1));
    nextBtn?.addEventListener('click', () => navigate(1));
    closeBtn?.addEventListener('click', () => lightboxDialog.close());

    lightboxDialog.addEventListener('click', (event) => {
      if (event.target === lightboxDialog) lightboxDialog.close();
    });

    lightboxDialog.addEventListener('close', () => {
      if (lightboxReturnFocus instanceof HTMLElement) lightboxReturnFocus.focus();
    });

    // Keyboard support
    window.addEventListener('keydown', (e) => {
      if (!lightboxDialog.open) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        navigate(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        navigate(1);
      }
    });

    // Touch swipe support
    let touchStartX = 0;
    let touchStartY = 0;
    const stage = lightboxDialog.querySelector('.lightbox-stage');
    if (stage) {
      stage.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;
        }
      }, { passive: true });

      stage.addEventListener('touchend', (e) => {
        if (e.changedTouches.length === 1) {
          const deltaX = e.changedTouches[0].clientX - touchStartX;
          const deltaY = e.changedTouches[0].clientY - touchStartY;
          if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
            if (deltaX < 0) navigate(1); // swipe left -> next
            else navigate(-1); // swipe right -> prev
          }
        }
      }, { passive: true });
    }
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

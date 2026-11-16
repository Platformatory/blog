// Click-to-expand for images and Mermaid diagrams inside a post body.
// Opens fitted to the screen; if the original is bigger than that, a second
// click (or the "Actual size" button) shows it 1:1 and lets you scroll/pan.
(function () {
  var body = document.querySelector('.ss-body');
  if (!body) return;

  var overlay = document.createElement('div');
  overlay.className = 'ss-lightbox';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Expanded image');
  overlay.hidden = true;
  overlay.innerHTML =
    '<div class="ss-lightbox-bar">' +
      '<button type="button" class="ss-lightbox-btn" data-act="zoom">Actual size</button>' +
      '<a class="ss-lightbox-btn" data-act="open" target="_blank" rel="noopener">Open original</a>' +
      '<button type="button" class="ss-lightbox-btn" data-act="close" aria-label="Close">✕</button>' +
    '</div>' +
    '<div class="ss-lightbox-stage"></div>';
  document.body.appendChild(overlay);

  var stage = overlay.querySelector('.ss-lightbox-stage');
  var zoomBtn = overlay.querySelector('[data-act="zoom"]');
  var openLink = overlay.querySelector('[data-act="open"]');
  var lastFocus = null;

  function setZoom(on) {
    overlay.classList.toggle('is-actual', on);
    zoomBtn.textContent = on ? 'Fit to screen' : 'Actual size';
  }

  function open(node, src) {
    lastFocus = document.activeElement;
    stage.innerHTML = '';
    stage.appendChild(node);
    setZoom(false);
    openLink.hidden = !src;
    if (src) openLink.href = src;
    zoomBtn.hidden = true;
    overlay.hidden = false;
    document.documentElement.classList.add('ss-lightbox-open');
    // Only offer 1:1 when the original is larger than the fitted view.
    var check = function () {
      var r = node.getBoundingClientRect();
      var nw = node.naturalWidth || node._naturalWidth || 0;
      var nh = node.naturalHeight || node._naturalHeight || 0;
      zoomBtn.hidden = !(nw > r.width + 2 || nh > r.height + 2);
    };
    if (node.tagName === 'IMG' && !node.complete) node.addEventListener('load', check, { once: true });
    else requestAnimationFrame(check);
    overlay.querySelector('[data-act="close"]').focus();
  }

  function close() {
    overlay.hidden = true;
    stage.innerHTML = '';
    document.documentElement.classList.remove('ss-lightbox-open');
    if (lastFocus) lastFocus.focus();
  }

  function expandable(el) {
    el.classList.add('ss-expandable');
    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', 'Expand ' + (el.getAttribute('alt') || 'diagram'));
  }

  // Images (skip tiny ones such as inline icons/badges)
  body.querySelectorAll('img').forEach(function (img) {
    var mark = function () { if ((img.naturalWidth || 0) >= 120) expandable(img); };
    if (img.complete) mark(); else img.addEventListener('load', mark, { once: true });
  });

  // Mermaid diagrams render asynchronously; mark them once an <svg> appears.
  var markMermaid = function () {
    body.querySelectorAll('.mermaid').forEach(function (m) {
      if (m.querySelector('svg') && !m.classList.contains('ss-expandable')) expandable(m);
    });
  };
  markMermaid();
  if ('MutationObserver' in window) {
    new MutationObserver(markMermaid).observe(body, { childList: true, subtree: true });
  }

  function activate(el) {
    if (el.tagName === 'IMG') {
      var big = new Image();
      big.src = el.currentSrc || el.src;
      big.alt = el.alt || '';
      open(big, big.src);
    } else {
      var svg = el.querySelector('svg').cloneNode(true);
      var vb = svg.viewBox && svg.viewBox.baseVal;
      svg.removeAttribute('style');
      svg.removeAttribute('height');
      svg.setAttribute('width', '100%');
      if (vb && vb.width) { svg._naturalWidth = vb.width * 1.6; svg._naturalHeight = vb.height * 1.6; svg.style.setProperty('--nat-w', (vb.width * 1.6) + 'px'); }
      open(svg, null);
    }
  }

  body.addEventListener('click', function (e) {
    var el = e.target.closest('.ss-expandable');
    if (!el || e.target.closest('a')) return;   // linked images keep their link
    e.preventDefault();
    activate(el);
  });
  body.addEventListener('keydown', function (e) {
    var el = e.target.closest && e.target.closest('.ss-expandable');
    if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); activate(el); }
  });

  overlay.addEventListener('click', function (e) {
    var act = e.target.closest('[data-act]');
    if (act && act.dataset.act === 'close') return close();
    if (act && act.dataset.act === 'zoom') return setZoom(!overlay.classList.contains('is-actual'));
    if (act) return;
    if (e.target === stage || e.target === overlay) return close();
    // click on the image itself toggles size (if 1:1 is available)
    if (!zoomBtn.hidden) setZoom(!overlay.classList.contains('is-actual'));
  });
  document.addEventListener('keydown', function (e) {
    if (!overlay.hidden && e.key === 'Escape') close();
  });
})();

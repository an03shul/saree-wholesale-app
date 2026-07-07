// Tiny progressive-enhancement script for the public landing page.
(function () {
  var y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();

  var header = document.querySelector(".site-header");
  function onScroll() {
    if (window.scrollY > 40) header.classList.add("scrolled");
    else header.classList.remove("scrolled");
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Scroll-reveal: fade/slide sections in as they enter the viewport.
  // Uses getBoundingClientRect (works everywhere), with a failsafe so content
  // can never be left invisible.
  var reveals = [].slice.call(document.querySelectorAll(".reveal"));
  function revealInView() {
    var h = window.innerHeight || document.documentElement.clientHeight;
    reveals = reveals.filter(function (el) {
      if (el.getBoundingClientRect().top < h * 0.9) { el.classList.add("in"); return false; }
      return true;
    });
  }
  revealInView();
  window.addEventListener("scroll", revealInView, { passive: true });
  window.addEventListener("resize", revealInView);
  // Failsafe: reveal anything still hidden after 2.6s no matter what.
  setTimeout(function () { reveals.forEach(function (el) { el.classList.add("in"); }); }, 2600);

  // Scroll-scrubbed hero: the headline lifts + fades as you scroll past.
  // Transform + opacity only (GPU-composited, cheap) — no texture re-rasterizing.
  var hero = document.querySelector(".hero");
  var heroInner = document.querySelector(".hero-inner");
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (hero && heroInner && !reduceMotion) {
    var ticking = false;
    function heroScrub() {
      var y = window.scrollY || window.pageYOffset || 0;
      var h = hero.offsetHeight || 1;
      var p = Math.min(1, Math.max(0, y / h));
      heroInner.style.transform = "translate3d(0," + (p * 40).toFixed(1) + "px,0)";
      heroInner.style.opacity = Math.max(0, 1 - p * 1.1).toFixed(3);
      ticking = false;
    }
    window.addEventListener("scroll", function () {
      if (!ticking) { requestAnimationFrame(heroScrub); ticking = true; }
    }, { passive: true });
    heroScrub();
  }

  // Interactive 3D storefront card: tilts toward the cursor (desktop pointer).
  var sfStage = document.querySelector(".storefront-stage");
  var sfCard = document.querySelector(".storefront-card");
  if (sfCard) {
    // If the storefront photo isn't present yet, hide the broken img so the
    // maroon card shows cleanly instead of a broken-image icon.
    var sfImg = sfCard.querySelector("img");
    if (sfImg) {
      sfImg.addEventListener("load", function () { this.classList.add("loaded"); });
      sfImg.addEventListener("error", function () { this.style.display = "none"; });
      if (sfImg.complete && sfImg.naturalWidth > 0) sfImg.classList.add("loaded");
    }
  }
  if (sfStage && sfCard && !reduceMotion && window.matchMedia("(pointer: fine)").matches) {
    var sfTick = false, lastE = null;
    function tilt() {
      var r = sfCard.getBoundingClientRect();
      var px = (lastE.clientX - r.left) / r.width - 0.5;
      var py = (lastE.clientY - r.top) / r.height - 0.5;
      sfCard.style.transform =
        "rotateY(" + (px * 12).toFixed(2) + "deg) rotateX(" + (-py * 12).toFixed(2) + "deg) scale(1.02)";
      sfTick = false;
    }
    sfStage.addEventListener("mousemove", function (e) {
      lastE = e;
      if (!sfTick) { requestAnimationFrame(tilt); sfTick = true; }
    });
    sfStage.addEventListener("mouseleave", function () { sfCard.style.transform = ""; });
  }
})();

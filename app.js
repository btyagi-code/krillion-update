(() => {
  const L = window.KrillLogic;
  const $ = id => document.getElementById(id);
  const CONFIRM_GRACE_MS = 5000;
  const LAUNCH = new Date(2026, 6, 15); // dive #1

  // ---------- storage (guarded: some contexts throw) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem("ku:" + k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem("ku:" + k, JSON.stringify(v)); } catch {} },
  };

  const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
  const diveNumber = () => Math.floor((new Date().setHours(0,0,0,0) - LAUNCH) / 864e5) + 1;

  let pace = store.get("pace", 25);
  let S = null; // current run state

  // ---------- screens ----------
  function show(id) {
    document.querySelectorAll(".screen").forEach(s => s.classList.toggle("active", s.id === id));
    if (id !== "play") setOcean(id === "results" && S ? S.depth / 10935 : 0);
    window.scrollTo(0, 0);
  }
  function setOcean(f) { $("ocean").style.setProperty("--d", Math.min(1, f).toFixed(3)); }
  function toast(msg) { const t = $("toast"); t.textContent = msg; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 1800); }

  // ---------- home ----------
  function renderHome() {
    document.querySelectorAll("[data-pace]").forEach(b => b.classList.toggle("on", +b.dataset.pace === pace));
    const done = store.get("daily:" + todayKey());
    $("btn-daily").textContent = done ? `🦐 Today's dive: ${done.depth.toLocaleString()} m (view)` : `🦐 Daily Dive #${diveNumber()}`;
    const st = store.get("stats", { played: 0, best: 0, streak: 0, krillions: 0 });
    $("stats").innerHTML = [
      ["played", "Dives"], ["streak", "Streak"], ["best", "Best (m)"], ["krillions", "💎 Found"],
    ].map(([k, l]) => `<div><b>${(st[k] || 0).toLocaleString()}</b><span>${l}</span></div>`).join("");
  }
  document.querySelectorAll("[data-pace]").forEach(b => b.onclick = () => { pace = +b.dataset.pace; store.set("pace", pace); renderHome(); });

  $("btn-daily").onclick = () => {
    const done = store.get("daily:" + todayKey());
    if (done) { S = done; renderResults(); show("results"); return; }
    start("daily", L.dailyPrompts(PROMPTS, todayKey()));
  };
  $("btn-unlimited").onclick = () => start("unlimited", L.randomPrompts(PROMPTS));
  $("btn-changes").onclick = () => show("changes");
  $("btn-back").onclick = () => show("home");
  $("btn-home").onclick = () => { renderHome(); show("home"); };

  // ---------- play ----------
  function start(mode, prompts) {
    S = { mode, pace, prompts: prompts.map(p => p.id), results: [], i: 0, score: 0, depth: 0, date: todayKey(), num: diveNumber() };
    show("play");
    nextPrompt();
  }
  const promptOf = id => PROMPTS.find(p => p.id === id);

  let timer = null, endsAt = 0, pausedLeft = null, pending = null, graceTimer = null, locked = false;

  function nextPrompt() {
    if (S.i >= S.prompts.length) return finish();
    const p = promptOf(S.prompts[S.i]);
    locked = false; pending = null;
    $("qnum").textContent = `Prompt ${S.i + 1} of ${S.prompts.length}`;
    $("prompt-text").textContent = p.text;
    $("guess").value = ""; $("guess").disabled = false; $("btn-dive").disabled = false;
    $("feedback").textContent = ""; $("feedback").className = "feedback";
    $("btn-appeal").classList.add("hidden"); $("btn-skip").classList.remove("hidden");
    $("reveal").classList.add("hidden");
    renderProgress();
    startTimer(S.pace);
    $("guess").focus();
  }

  function renderProgress() {
    $("progress").innerHTML = S.prompts.map((_, k) => {
      const r = S.results[k];
      return `<i class="${k === S.i ? "cur" : ""}">${r ? r.emoji : ""}</i>`;
    }).join("");
    $("hud-depth").textContent = S.depth.toLocaleString() + " m";
    const f = S.depth / 10935;
    $("gauge-fill").style.height = (f * 100) + "%";
    $("krill").style.top = (f * 100) + "%";
    setOcean(f);
  }

  // timer
  function startTimer(sec) {
    clearInterval(timer); pausedLeft = null;
    const el = $("timer");
    if (!sec) { el.classList.add("hidden"); return; }
    el.classList.remove("hidden", "low", "paused");
    endsAt = Date.now() + sec * 1000;
    timer = setInterval(tick, 100); tick();
  }
  function timeLeft() { return pausedLeft != null ? pausedLeft : Math.max(0, endsAt - Date.now()); }
  function tick() {
    const left = timeLeft(), sec = S.pace;
    $("timer-text").textContent = Math.ceil(left / 1000);
    $("ring").style.strokeDashoffset = 119.4 * (1 - left / (sec * 1000));
    $("timer").classList.toggle("low", left < 6000);
    if (left <= 0 && !locked) timeUp();
  }
  function pauseTimer() {
    if (!S.pace || pausedLeft != null) return;
    pausedLeft = timeLeft(); $("timer").classList.add("paused");
    // Pause is a grace period, not a free think-break.
    graceTimer = setTimeout(resumeTimer, CONFIRM_GRACE_MS);
  }
  function resumeTimer() {
    clearTimeout(graceTimer);
    if (pausedLeft == null) return;
    endsAt = Date.now() + pausedLeft; pausedLeft = null; $("timer").classList.remove("paused");
  }
  function stopTimer() { clearInterval(timer); clearTimeout(graceTimer); }

  function timeUp() {
    if (pending) return settle(pending, $("guess").value, true); // a pending typo-fix counts if time runs out
    settle(null, $("guess").value || "(time's up)");
  }

  $("guess").addEventListener("input", () => {
    if (pending && L.normalize($("guess").value) !== pending.typed) {
      pending = null; resumeTimer(); $("feedback").textContent = "";
    }
  });

  $("guess-form").onsubmit = e => {
    e.preventDefault();
    if (locked) return;
    const raw = $("guess").value.trim();
    if (!raw) return;
    if (pending && L.normalize(raw) === pending.typed) return settle(pending.answer, raw, true);

    const p = promptOf(S.prompts[S.i]);
    const m = L.matchGuess(p, raw);
    const fb = $("feedback");
    fb.className = "feedback";
    if (m.status === "exact") return settle(m.answer, raw);
    if (m.status === "typo") {
      pending = { answer: m.answer, typed: L.normalize(raw) };
      fb.innerHTML = `Did you mean <b>${m.answer.name}</b>? Press Enter to confirm, or keep typing. <i>(clock paused ${CONFIRM_GRACE_MS / 1000}s)</i>`;
      pauseTimer();
      return;
    }
    if (m.status === "vague") {
      fb.className = "feedback bad";
      fb.textContent = "Be more specific: type the full name.";
      return;
    }
    fb.className = "feedback bad";
    fb.textContent = `"${raw}" isn't in our list. Try another, or flag it if you're sure it's valid.`;
    const ap = $("btn-appeal"); ap.classList.remove("hidden"); ap.dataset.raw = raw;
  };

  $("btn-appeal").onclick = () => {
    const raw = $("btn-appeal").dataset.raw;
    const appeals = store.get("appeals", []);
    appeals.push({ prompt: S.prompts[S.i], answer: raw, date: todayKey() });
    store.set("appeals", appeals);
    toast("Flagged for review 🙋");
    settle(null, raw, false, true);
  };
  $("btn-skip").onclick = () => !locked && settle(null, "(skipped)");

  function settle(answer, raw, fixed = false, appealed = false) {
    if (locked) return;
    locked = true; pending = null; stopTimer();
    $("guess").disabled = true; $("btn-dive").disabled = true;
    $("btn-appeal").classList.add("hidden"); $("btn-skip").classList.add("hidden");
    $("feedback").textContent = "";
    const p = promptOf(S.prompts[S.i]);
    const tier = answer ? L.tierFor(answer) : L.MISS;
    const res = { prompt: p.id, text: p.text, raw, answer: answer ? answer.name : null, pct: answer ? answer.pct : null,
      tier: tier.key, tierName: tier.name, pts: tier.pts, emoji: appealed ? "🙋" : tier.emoji, appealed };
    S.results.push(res);
    S.score += tier.pts;
    S.depth = L.depthFor(S.score);
    renderReveal(res, p, fixed);
    renderProgress();
  }

  function renderReveal(r, p, fixed) {
    const el = $("reveal");
    el.className = "reveal " + r.tier;
    let body;
    if (r.tier === "miss") {
      body = r.appealed
        ? `<p>Saved to your appeals list. No points this time, but it's tracked.</p>`
        : `<p>No points this round.</p>`;
    } else if (r.tier === "clever") {
      body = `<p><b>${r.answer}</b> is the classic "I'll pick something weird" answer: ${r.pct}% of divers had the exact same idea. Too Clever gives 15 pts, a little more than Plankton but well short of Rare.</p>`;
    } else {
      body = `<p><b>${r.answer}</b>: about ${r.pct}% of divers said this.${fixed ? " (spelling fixed)" : ""}</p>`;
    }
    const deeper = L.rarestAnswers(p, 3).filter(a => a.name !== r.answer).map(a => a.name).join(", ");
    el.innerHTML = `
      <p class="tier">${r.emoji} ${r.tierName} <span class="pts">+${r.pts}</span></p>
      ${body}
      <p>Deeper answers: ${deeper}</p>
      <button class="big" id="btn-next">${S.i + 1 < S.prompts.length ? "Keep diving ↓" : "Surface & see results"}</button>`;
    $("btn-next").onclick = () => { S.i++; nextPrompt(); };
    $("btn-next").focus();
  }

  // ---------- results ----------
  function finish() {
    stopTimer();
    const st = store.get("stats", { played: 0, best: 0, streak: 0, krillions: 0, lastDaily: null });
    st.played++;
    st.best = Math.max(st.best, S.depth);
    st.krillions += S.results.filter(r => r.tier === "krillion").length;
    if (S.mode === "daily" && S.pace === 25) {
      const y = new Date(); y.setDate(y.getDate() - 1);
      const yKey = `${y.getFullYear()}-${String(y.getMonth()+1).padStart(2,"0")}-${String(y.getDate()).padStart(2,"0")}`;
      st.streak = st.lastDaily === yKey ? st.streak + 1 : 1;
      st.lastDaily = todayKey();
    }
    store.set("stats", st);
    if (S.mode === "daily") store.set("daily:" + todayKey(), S);
    renderResults();
    show("results");
  }

  function renderResults() {
    $("end-depth").textContent = S.depth.toLocaleString() + " m";
    $("end-zone").textContent = "🌊 " + L.zoneFor(S.depth);
    const paceName = { 25: "Classic", 45: "Chill", 0: "Zen" }[S.pace];
    $("end-score").textContent = `${S.score} pts · ${S.mode === "daily" ? "Daily #" + S.num : "Unlimited"} · ${paceName}`;
    $("review").innerHTML = S.results.map(r => {
      const p = promptOf(r.prompt);
      const deep = L.rarestAnswers(p, 4).map(a => `${L.tierFor(a).emoji} ${a.name}`).join(" · ");
      return `<li><div class="q">${r.text}</div>
        <div class="yours">${r.emoji} ${r.answer || r.raw} → <b>${r.tierName}</b> (+${r.pts})${r.appealed ? " · appealed" : ""}</div>
        <div class="deeper">Deepest: ${deep}</div></li>`;
    }).join("");
  }

  $("btn-share").onclick = async () => {
    const paceName = { 25: "⏱", 45: "🌊", 0: "🧘" }[S.pace];
    const txt = `Krillion Update ${S.mode === "daily" ? "#" + S.num : "♾"} ${paceName}\n${S.results.map(r => r.emoji).join("")}\n${S.depth.toLocaleString()} m · ${L.zoneFor(S.depth)}`;
    try { await navigator.clipboard.writeText(txt); toast("Copied! 🦐"); }
    catch { prompt("Copy your result:", txt); }
  };

  document.addEventListener("keydown", e => {
    if (e.key === "Enter" && locked && $("play").classList.contains("active") && document.activeElement !== $("btn-next")) {
      const n = $("btn-next"); if (n) n.click();
    }
  });

  renderHome();
})();

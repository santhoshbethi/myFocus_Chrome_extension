(function(){
  const TYPE_REQ = 'FOCUSCOACH_ANALYZE';
  const TYPE_RES = 'FOCUSCOACH_RESULT';

  function tokenize(t){ return (t||'').toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []; }
  const STOP = new Set(['the','a','an','and','or','but','if','then','else','for','to','of','in','on','at','by','with','is','are','was','were','be','been','being','this','that','these','those','as','it','its','from','we','you','they','he','she','i','your','his','her','their','our']);
  function keywords(goal, max=12){
    const m=new Map();
    for(const w of tokenize(goal)){ if(STOP.has(w)) continue; m.set(w,(m.get(w)||0)+1); }
    return Array.from(m.entries()).sort((a,b)=>b[1]-a[1]).slice(0,max).map(([w])=>w);
  }
  function heuristic(goal, text){
    const kws = keywords(goal);
    if(!kws.length) return { score: 0, hits: [] };
    const t=(text||'').toLowerCase();
    const hits = kws.filter(k=>t.includes(k));
    const ratio = hits.length/kws.length;
    const score = Math.round(Math.min(100, Math.pow(ratio, 0.7)*100));
    return { score, hits };
  }

  async function promptSummary(goal, text){
    if(!(window.ai && window.ai.languageModel)) throw new Error('Prompt API unavailable');
    const caps = await window.ai.languageModel.capabilities();
    if(caps.available !== 'readily') throw new Error('Prompt API not ready');
    const session = await window.ai.languageModel.create({
      systemPrompt: 'You are FocusCoach AI. Summarize concisely in ENGLISH and assess relevance to the user\'s goal. Only recommend READ when the content clearly matches the goal; otherwise SKIP.'
    });
    const clipped = (text||'').slice(0,6000);
    const goalKws = keywords(goal).join(', ');
    const prompt = `User Goal: ${goal}\nGoal Keywords: ${goalKws}\n\nWebpage Content:\n"""${clipped}"""\n\nTask:\n- Summarize the page in 2–3 lines in ENGLISH.\n- Score relevance to the user goal from 0–100. Heavily penalize if keywords are absent or only loosely related.\n- Recommendation must be READ if relevance >= 70, else SKIP.\n\nRules:\n- If the page topic is unrelated to the goal keywords, set Relevance <= 10 and Recommendation: SKIP.\n- Be concise; do not add extra headings.\n\nFormat exactly:\nSummary: <one short paragraph>\nRelevance: <0-100>\nRecommendation: <READ|SKIP>`;
    const res = await session.prompt(prompt, { signal: AbortSignal.timeout(12000) });
    return res;
  }

  function parseResponse(resp){
    const summary = resp.match(/Summary:(.*)/i)?.[1]?.trim() ?? '';
    const scoreStr = resp.match(/Relevance:(.*)/i)?.[1]?.trim() ?? '0';
    const modelScore = Math.max(0, Math.min(100, Number(scoreStr)||0));
    const rec = (resp.match(/Recommendation:(.*)/i)?.[1]?.trim() ?? '').toUpperCase();
    return { summary, modelScore, rec };
  }

  async function analyze(goal){
    const text = document.body ? document.body.innerText : document.documentElement.innerText;
    const { score: hScore } = heuristic(goal, text);

    try{
      const resp = await promptSummary(goal, text);
      const { summary, modelScore, rec } = parseResponse(resp);
      // Blend with heuristic
      let finalScore = Math.round(0.25*modelScore + 0.75*hScore);
      if(hScore <= 10 && modelScore >= 50) finalScore = Math.min(finalScore, 25);
      finalScore = Math.max(0, Math.min(100, finalScore));
      const finalRec = finalScore >= 70 ? 'READ' : 'SKIP';
      return { summary, relevance: finalScore, recommendation: finalRec };
    } catch(err){
      // Fallback: heuristic only
      const summary = (text||'').slice(0,400).replace(/\s+/g,' ').trim();
      const finalRec = hScore >= 70 ? 'READ' : 'SKIP';
      return { summary, relevance: hScore, recommendation: finalRec };
    }
  }

  window.addEventListener('message', async (ev)=>{
    const data = ev.data || {};
    if(data.type !== TYPE_REQ) return;
    try{
      const goal = String(data.goal||'').trim();
      if(!goal) return;
      const result = await analyze(goal);
      window.postMessage({ type: TYPE_RES, ...result }, '*');
    }catch(err){
      window.postMessage({ type: TYPE_RES, error: String(err && err.message || err) }, '*');
    }
  });
})();

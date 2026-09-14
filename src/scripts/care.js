import MarkdownIt from 'markdown-it';
const md = new MarkdownIt({ html: false, linkify: false, breaks: true });
md.renderer.rules.table_open = () => '<div class="table-wrap"><table>';
md.renderer.rules.table_close = () => '</table></div>';
const linkRule = md.renderer.rules.link_open || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => { tokens[idx].attrSet('target', '_blank'); tokens[idx].attrSet('rel', 'noopener noreferrer'); return linkRule(tokens, idx, options, env, self); };
const $ = selector => document.querySelector(selector);
const node = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text !== undefined) el.textContent = text; return el; };
let user, current, next, listGeneration = 0, articleGeneration = 0;
async function api(path, data) {
  const response = await fetch(`/care/api${path}`, { credentials: 'same-origin', cache: 'no-store', headers: data ? { 'Content-Type': 'application/json' } : {}, method: data ? 'POST' : 'GET', body: data ? JSON.stringify(data) : undefined });
  let result; try { result = await response.json(); } catch { throw new Error('서버 연결을 확인한 뒤 다시 시도해 주세요.'); }
  if (!response.ok) { if (response.status === 401 && path !== '/login') showLogin(); throw new Error(result.error || '다시 시도해 주세요.'); }
  return result;
}
function showLogin() { user = null; current = null; articleGeneration++; listGeneration++; $('#library-view').hidden = true; $('#identity').hidden = true; $('#private-label').hidden = false; $('#loading').hidden = true; $('#login-view').hidden = false; $('#briefing').replaceChildren(); $('#archive-list').replaceChildren(); }
function dateLabel(value) { return new Date(`${value}T12:00:00+09:00`).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }); }
async function enter(reader) {
  user = reader; $('#reader-name').textContent = reader.name; $('#identity').hidden = false; $('#private-label').hidden = true;
  $('#login-view').hidden = true; $('#loading').hidden = true; $('#library-view').hidden = false;
  $('#password').value = ''; $('#login-error').textContent = '';
  const selected = new URL(location.href).searchParams.get('date');
  if (selected && /^\d{4}-\d{2}-\d{2}$/.test(selected)) await openBriefing(selected); else await latest();
}
function tab(archive) {
  $('#archive').hidden = !archive; $('#briefing').hidden = archive;
  for (const [id, active] of [['#latest-tab', !archive], ['#archive-tab', archive]]) { $(id).classList.toggle('active', active); $(id).setAttribute('aria-pressed', String(active)); }
  $('#notice').textContent = '';
}
async function latest() {
  tab(false); $('#briefing').replaceChildren(node('p', 'empty', '브리핑을 불러오는 중입니다…'));
  try { const data = await api('/briefings'); if (!user) return; if (data.items.length) await openBriefing(data.items[0].date); else $('#briefing').replaceChildren(node('p', 'empty', '첫 브리핑이 도착하면 이곳에서 읽을 수 있습니다.')); }
  catch (e) { $('#notice').textContent = e.message; $('#briefing').replaceChildren(); }
}
async function openBriefing(date) {
  const generation = ++articleGeneration; tab(false);
  $('#briefing').replaceChildren(node('p', 'empty', '브리핑을 불러오는 중입니다…'));
  try { const data = await api(`/briefings/${date}`); if (generation !== articleGeneration || !user) return; current = data; renderBriefing(); history.replaceState(null, '', `/care?date=${date}`); }
  catch (e) { if (generation === articleGeneration) { $('#notice').textContent = e.message; $('#briefing').replaceChildren(); } }
}
function commentBox(section, label, open = false) {
  const date = current.date;
  const details = node('details', 'opinions'); details.open = open;
  const summary = node('summary'); const list = node('div', 'comments-list');
  const relevant = () => current.comments.filter(c => c.section === section);
  function paint() {
    const comments = relevant(); summary.textContent = `${label} · ${comments.length}`; list.replaceChildren();
    if (!comments.length) list.append(node('p', 'empty-comments', '함께 생각해 볼 점을 남겨 주세요.'));
    comments.forEach(c => { const item = node('div', 'comment'), meta = node('div', 'comment-meta');
      meta.append(node('strong', '', c.author), node('time', '', new Date(c.created).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })));
      item.append(meta, node('p', '', c.body)); list.append(item); });
  }
  paint();
  const form = node('form', 'comment-form'), labelEl = node('label', '', `${user.name}의 의견`), input = node('textarea');
  input.id = `comment-${section}`; labelEl.htmlFor = input.id; input.required = true; input.maxLength = 3000; input.placeholder = '이 자료를 읽고 어떤 생각이 드셨나요?';
  const submit = node('button', '', '의견 남기기'); submit.type = 'submit'; const error = node('p', 'comment-error'); error.setAttribute('role', 'alert');
  let pending = null;
  form.addEventListener('submit', async event => { event.preventDefault(); if (!input.value.trim()) return; submit.disabled = true; error.textContent = '';
    const content = input.value.trim(); if (!pending || pending.body !== content) pending = { id: crypto.randomUUID(), section, body: content };
    try { const { comment } = await api(`/briefings/${date}/comments`, pending); if (current?.date !== date) return; if (!current.comments.some(c => c.id === comment.id)) current.comments.push(comment); input.value = ''; pending = null; paint(); }
    catch (e) { error.textContent = e.message; } finally { submit.disabled = false; }
  });
  form.append(labelEl, input, submit, error); details.append(summary, list, form); return details;
}
function renderBriefing() {
  const article = $('#briefing'); article.replaceChildren();
  const meta = node('div', 'article-meta'); meta.append(node('time', '', dateLabel(current.date)), node('span', 'tag', 'DAILY BRIEFING'));
  article.append(meta, node('h2', 'article-title', current.title));
  const card = node('div', 'summary-card'), caption = node('div', 'summary-caption', '오늘, 이것만 기억한다면'); caption.append(node('span', '', '↗')); card.append(caption);
  current.summary.forEach(s => card.append(node('p', '', s))); article.append(card);
  const contents = node('details', 'contents'); contents.append(node('summary', '', `오늘의 목차 · ${current.sections.length}개 주제`)); const ol = node('ol');
  current.sections.forEach(s => { const li = node('li'), a = node('a', '', s.title); a.href = `#topic-${s.id}`; li.append(a); ol.append(li); }); contents.append(ol); article.append(contents);
  current.sections.forEach((s, i) => { const section = node('section', 'section'); section.id = `topic-${s.id}`;
    const prose = node('div', 'prose'); prose.innerHTML = md.render(s.body);
    section.append(node('div', 'section-label', `FIELD NOTES / ${String(i + 1).padStart(2, '0')}`), node('h2', '', s.title), prose, commentBox(s.id, '이 주제에 대한 의견')); article.append(section);
  });
  const sources = node('section', 'sources'); sources.append(node('h3', '', '자료의 출처')); const sourceList = node('ol');
  current.sources.forEach(s => { const li = node('li'), a = node('a', '', s.title); a.href = s.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; li.append(a, node('small', '', new URL(s.url).hostname)); sourceList.append(li); }); sources.append(sourceList); article.append(sources);
  const all = node('section', 'all-comments'); all.append(node('h2', '', '오늘의 브리핑, 어떻게 읽으셨나요?'), node('p', '', '전체 내용을 연결해 떠오른 생각을 나눠 주세요.'), commentBox('all', '전체 의견', true)); article.append(all);
  const removed = [...new Set(current.comments.filter(c => c.section !== 'all' && !current.sections.some(s => s.id === c.section)).map(c => c.section))];
  if (removed.length) { const box = node('section', 'all-comments'); box.append(node('p', 'archived-topic', '수정 전 주제에 남긴 의견')); removed.forEach(id => box.append(commentBox(id, '이전 주제의 의견'))); article.append(box); }
}
async function archive(more = false) {
  articleGeneration++; tab(true); const generation = ++listGeneration; const q = $('#search').value;
  if (!more) { $('#archive-list').replaceChildren(); next = null; } $('#load-more').disabled = true;
  try { const data = await api(`/briefings?q=${encodeURIComponent(q)}${more && next ? `&before=${next}` : ''}`); if (generation !== listGeneration || !user) return;
    if (!data.items.length && !more) $('#archive-list').append(node('p', 'empty', '검색 결과가 없습니다.'));
    data.items.forEach(b => { const button = node('button', 'archive-item'); button.append(node('time', '', dateLabel(b.date)), node('h3', '', b.title), node('p', '', `의견 ${b.comments}개 · 브리핑 읽기 →`)); button.addEventListener('click', () => { openBriefing(b.date); window.scrollTo(0, 0); }); $('#archive-list').append(button); });
    next = data.next; $('#load-more').hidden = !next;
  } catch (e) { $('#notice').textContent = e.message; } finally { $('#load-more').disabled = false; }
}
$('#login-form').addEventListener('submit', async event => { event.preventDefault(); const button = $('#login-form button[type="submit"]'); button.disabled = true; $('#login-error').textContent = '';
  try { await enter((await api('/login', { password: $('#password').value })).user); } catch (e) { $('#login-error').textContent = e.message; } finally { button.disabled = false; }
});
$('#show-password').addEventListener('click', () => { const hidden = $('#password').type === 'password'; $('#password').type = hidden ? 'text' : 'password'; $('#show-password').textContent = hidden ? '숨기기' : '보기'; $('#show-password').setAttribute('aria-label', hidden ? '비밀번호 숨기기' : '비밀번호 표시'); });
$('#logout').addEventListener('click', async () => { try { await api('/logout', {}); showLogin(); history.replaceState(null, '', '/care'); } catch (e) { $('#notice').textContent = e.message; } });
$('#latest-tab').addEventListener('click', latest); $('#archive-tab').addEventListener('click', () => archive()); $('#load-more').addEventListener('click', () => archive(true));
let timer; $('#search').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => archive(), 250); });
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
async function initialize() { try { await enter((await api('/me')).user); } catch (e) { showLogin(); if (e.message !== '로그인이 필요합니다.') $('#login-error').textContent = e.message; } }
initialize();

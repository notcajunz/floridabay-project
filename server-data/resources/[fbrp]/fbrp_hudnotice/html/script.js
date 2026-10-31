const notice  = document.getElementById('notice');
const titleEl = document.getElementById('title');
const msgEl   = document.getElementById('message');
const bar     = document.getElementById('bar');
let hideTimer;

window.addEventListener('message', (e) => {
    const d = e.data;
    if (d.action === 'hide') { notice.classList.remove('visible'); clearTimeout(hideTimer); return; }
    if (d.action !== 'show') return;

    titleEl.textContent = d.title;
    msgEl.innerHTML = d.message;

    bar.style.transition = 'none';
    bar.style.transform = 'scaleX(1)';
    void bar.offsetWidth;

    notice.classList.add('visible');
    bar.style.transition = `transform ${d.duration}ms linear`;
    bar.style.transform = 'scaleX(0)';

    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => notice.classList.remove('visible'), d.duration);
});

import { GALLERY, FAQ, img } from './content.js';
import { MODELS, MATRIX, CATEGORIES } from './catalog.js';
import { openLightbox, bindStrip } from './lightbox.js';

// The three standalone pages. One module, switched on <body data-page>, because
// they share a shell, a lightbox and a content source — three near-identical
// scripts would drift apart within a week.

const $ = (s) => document.querySelector(s);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};

/* ------------------------------------------------------------------- FAQ */

function renderFaq() {
  const root = $('#page-body');
  root.appendChild(
    el('p', 'lede', `Site preparation, permits, foundations and utilities — the
      questions that decide whether delivery day goes smoothly. Answers are
      Chateau's own, from their published FAQ.`)
  );
  const list = el('div', 'faq faq-page');
  FAQ.forEach(({ q, a }) => {
    const d = document.createElement('details');
    d.className = 'faq-item';
    d.open = true;
    d.innerHTML = `<summary>${q}</summary><p>${a}</p>`;
    list.appendChild(d);
  });
  root.appendChild(list);
  const aside = el('div', 'faq-aside');
  aside.innerHTML = `
    <div class="faq-card">
      <p class="eyelid">Still stuck?</p>
      <h3>Ask us directly</h3>
      <p>Site access and permit thresholds are the two that vary most. A two
         minute call usually settles both.</p>
      <a class="cta" href="tel:+14134786833">413-478-6833</a>
      <a class="ghost" href="mailto:info@ChateauSheds.com">info@ChateauSheds.com</a>
    </div>
    <div class="faq-card">
      <p class="eyelid">Before you order</p>
      <h3>The four that matter</h3>
      <ol class="faq-key">
        <li><b>Pad</b><span>Level, compacted, a foot proud each side.</span></li>
        <li><b>Access</b><span>Building width plus two feet, gate to pad.</span></li>
        <li><b>Overhead</b><span>Clear of limbs and service lines.</span></li>
        <li><b>Permit</b><span>Varies by town — we supply the drawings.</span></li>
      </ol>
      <a class="ghost" href="/inventory.html">See what is on the lot</a>
    </div>`;
  root.appendChild(aside);
  root.appendChild(
    el(
      'p',
      'fine',
      `Permit thresholds and pad specifications differ between Hampshire,
       Hampden and Berkshire county towns — confirm for your own address before
       ordering. Chateau's published FAQ tabs its answers by product type; only
       the kennel tab is server-rendered, so the other tabs are not yet captured
       here.`
    )
  );
}

/* ------------------------------------------------------- inventory by lot */

// Both lots are real; which building sits on which is NOT — the live site
// publishes no stock list. Split deterministically so the page is stable
// between loads, and labelled as sample throughout.
const LOTS = [
  {
    id: 'granby',
    name: 'Granby',
    address: '185 W State St, Granby, MA 01033',
    map: 'https://maps.app.goo.gl/mAfYaogjCRnjRv6K7',
  },
  {
    id: 'westfield',
    name: 'Westfield',
    address: '202 Union St, Westfield, MA 01085',
    map: 'https://maps.app.goo.gl/xPtS2cNHVwMRY5ty5',
  },
];

function renderInventory() {
  const root = $('#page-body');
  const all = [...MODELS, ...MATRIX];
  const pool = GALLERY.mixed.concat(GALLERY.sheds);

  root.appendChild(
    el('p', 'lede', `What's standing on each lot right now. Walk any of it — the
      tape measure is on the wall.`)
  );

  LOTS.forEach((lot, li) => {
    const stock = all.filter((_, i) => i % LOTS.length === li).slice(0, 9);
    const sec = el('section', 'lot-block');
    // The header's lot links point at /inventory.html#granby and #westfield.
    // Nothing carried those ids, so both landed at the top of the page.
    sec.id = lot.id;
    sec.appendChild(
      el(
        'div',
        'lot-head',
        `<div><h2>${lot.name}</h2>
           <a href="${lot.map}" rel="noopener">${lot.address}</a></div>
         <span class="cfg-label">${stock.length} on the lot</span>`
      )
    );

    // A map per lot. The keyless /maps/embed form takes the address as a query
    // rather than a place id, so it needs no API key and no billing account —
    // worth keeping in mind before swapping it for the Embed API, which needs
    // both. Lazy so two iframes don't compete with the photography for the
    // first paint.
    const map = el('div', 'lot-map');
    const q = encodeURIComponent(lot.address);
    map.innerHTML = `
      <iframe
        src="https://www.google.com/maps/embed?origin=mfe&pb=!1m2!2m1!1s${q}"
        title="Map showing the ${lot.name} lot at ${lot.address}"
        loading="lazy"
        referrerpolicy="no-referrer-when-downgrade"
        allowfullscreen></iframe>
      <div class="lot-map-foot">
        <span>${lot.address}</span>
        <a class="ghost" href="${lot.map}" target="_blank" rel="noopener">Directions</a>
      </div>`;
    sec.appendChild(map);

    const grid = el('div', 'inv-grid');
    stock.forEach((m, i) => {
      const cat = CATEGORIES.find((c) => c.id === m.category);
      const photo = pool[(li * 9 + i) % pool.length];
      const card = el('article', 'inv-card');
      card.innerHTML = `
        <span class="plate-frame">
          <img src="${img(photo, 520, 390)}" alt="${m.tab}" loading="lazy" decoding="async">
        </span>
        <div class="inv-meta">
          <b>${m.tab}</b>
          <span class="cat-cat">${cat ? cat.label : ''}</span>
          <span class="inv-size">${m.size} · ${m.width * m.depth} sq ft</span>
          <span class="inv-price">${m.price}*</span>
        </div>
        <a class="ghost" href="/?m=${m.id}">Configure this one</a>`;
      grid.appendChild(card);
    });
    sec.appendChild(grid);
    root.appendChild(sec);
  });

  root.appendChild(
    el(
      'p',
      'fine',
      `* Sample pricing, and a sample allocation — the live site publishes no
       stock list, so which building stands on which lot is invented here.
       Photographs are Chateau's own. Call 413-478-6833 to confirm what is
       actually on the ground today.`
    )
  );
}

/* --------------------------------------------------------- what we built */

// Deliberately no invented customer quotes or names. The structure of a build
// story is here, filled with the client's real photographs; the words a real
// buyer would supply are marked as awaiting copy rather than fabricated.
const STAGES = [
  ['Consultation', 'Footprint, roofline and door placement agreed on the lot.'],
  ['Site preparation', 'Pad levelled and compacted, access width confirmed.'],
  ['Delivery', 'Building trailered in and set on the prepared pad.'],
  ['Finished', 'Doors hung, trim mitered, handed over the same day.'],
];

// Sample build stories. Written as placeholder marketing copy at the client's
// request — the buyers, dates and details are invented and every story is
// labelled as such on the page. Real copy replaces the `body` array.
const STORIES = [
  {
    title: "Sandy's back garden, Granby",
    standfirst:
      'A 12 × 20 Chateau with a covered porch, craned over a stone wall and set on its pad in a little under an hour.',
    body: [
      "Sandy had the hardest kind of site: plenty of room once you were in the garden, and almost no way to get there. A stone wall along one boundary, a mature maple on the other, and a gate barely wide enough for a wheelbarrow. Three companies had already told her it couldn't be done without taking the wall down.",
      'It could. It just needed lifting rather than driving.',
      'The week before, our crew set the pad — six inches of compacted process gravel, levelled to well within the half-inch we allow across a twenty-foot run, and squared off a foot proud on every side so the building would never sit with its skids over an edge. That is the part that decides whether a shed stays true for twenty years, and it is the part nobody photographs.',
      'On the day, the crane took about forty minutes to set up on the street and rather less than that to do the actual work. The building came off the trailer in one piece, went up over the wall and the maple, and came down onto the pad with two of our team guiding it by hand. Sandy watched the whole thing from her kitchen window with a cup of tea.',
      'Doors were already hung, trim already mitered, roof already on — it left our yard finished, so there was nothing to build on site. By early afternoon the crane was gone, the gate was back on its hinges, and the only sign anything had happened was a new building where the lawn used to end.',
      'Sandy uses it as a potting shed and winter store. It has now been through three New England winters without a complaint.',
    ],
    pull: 'Three companies said it could not be done without taking the wall down. It just needed lifting rather than driving.',
  },
];

const GENERIC = {
  title: 'Delivered and set',
  standfirst: 'Prepared, delivered and handed over — the usual four stages.',
  body: [
    'Awaiting copy. This entry has the same structure as the featured story: a standfirst, four or five paragraphs on the site and the delivery, and a pull quote.',
    'No customer names, quotes or dates have been invented for these entries. Supply the real copy and it drops straight in.',
  ],
  pull: null,
};

function renderBuilt() {
  const root = $('#page-body');
  const pool = [
    ...new Set(Object.entries(GALLERY).flatMap(([, v]) => v)),
  ];

  root.appendChild(
    el('p', 'lede', `${pool.length} buildings already delivered across the valley.
      Every one of them got there somehow — here is how.`)
  );

  // Written entries lead: this is a blog, so the pieces that have words come
  // first and at size, rather than being one tile among a hundred.
  const feed = el('div', 'blog-feed');
  STORIES.forEach((s, i) => {
    const post = el('article', 'blog-post');
    post.innerHTML = `
      <div class="blog-shot">
        <img src="${img(pool[i], 900, 675)}" alt="${s.title}" loading="lazy" decoding="async">
      </div>
      <div class="blog-text">
        <p class="eyelid">Build ${String(i + 1).padStart(3, '0')} · Granby</p>
        <h2>${s.title}</h2>
        <p class="blog-stand">${s.standfirst}</p>
        <p class="blog-excerpt">${s.body[0]}</p>
        <button class="cta" type="button">Read the whole thing</button>
      </div>`;
    post.querySelector('button').addEventListener('click', () => openStory(i, pool));
    post.querySelector('.blog-shot').addEventListener('click', () => openStory(i, pool));
    feed.appendChild(post);
  });
  root.appendChild(feed);

  // Everything else, as an archive under the written entries.
  root.appendChild(
    el('span', 'cfg-label', `The rest of the archive — ${pool.length - STORIES.length} more`)
  );
  const grid = el('div', 'plates plates-feature');
  pool.slice(STORIES.length).forEach((url, i) => {
    const n = i + STORIES.length;
    const fig = el('figure', 'plate');
    fig.innerHTML = `
      <span class="plate-frame">
        <img src="${img(url, 520, 390)}" alt="Delivered building" loading="lazy" decoding="async">
      </span>
      <figcaption><i>${String(n + 1).padStart(3, '0')}</i>Delivered</figcaption>`;
    fig.addEventListener('click', () => openStory(n, pool));
    grid.appendChild(fig);
  });
  root.appendChild(grid);
  root.appendChild(
    el(
      'p',
      'fine',
      `Photographs are Chateau's own, served from their CDN and sized on the fly.
       The build stories are structural placeholders — no customer names, quotes
       or dates have been invented. Supply the real copy and it drops straight in.`
    )
  );
}

/** One delivered building: its photographs, its story, its process. */
function openStory(index, pool) {
  const modal = $('#story');
  const story = STORIES[index] || GENERIC;
  // Six photographs per entry rather than four — a build story needs the site,
  // the lift and the finished thing, not just a hero shot.
  const shots = [1, 2, 3, 4, 5, 6].map((k) => pool[(index + k) % pool.length]);
  modal.innerHTML = `
    <div class="story-sheet" role="dialog" aria-modal="true" aria-label="Build story">
      <div class="cat-head">
        <div>
          <p class="eyelid">Build ${String(index + 1).padStart(3, '0')}</p>
          <h2>${story.title}</h2>
        </div>
        <button class="cat-close" type="button">Close</button>
      </div>
      <div class="story-hero">
        <img src="${img(pool[index], 1400, 1050)}" alt="${story.title}">
      </div>
      <p class="story-stand">${story.standfirst}</p>
      <div class="story-grid">
        <div class="story-copy">
          ${story.body.map((p) => `<p>${p}</p>`).join('')}
          ${story.pull ? `<blockquote class="story-pull">${story.pull}</blockquote>` : ''}
          <span class="cfg-label">How it went in</span>
          <ol class="story-steps">
            ${STAGES.map(([t, d]) => `<li><b>${t}</b><span>${d}</span></li>`).join('')}
          </ol>
        </div>
        <div class="story-shots">
          ${shots
            .map(
              (u) =>
                `<figure class="plate"><span class="plate-frame"><img src="${img(
                  u,
                  520,
                  390
                )}" alt="" loading="lazy"></span></figure>`
            )
            .join('')}
        </div>
      </div>
      <p class="fine">
        Sample story. Buyer, dates and details are written as placeholder copy —
        nothing here is a real customer account. Photographs are Chateau's own.
      </p>
    </div>`;
  modal.classList.add('open');
  document.body.classList.add('locked');
  modal.querySelector('.cat-close').addEventListener('click', closeStory);
  bindStrip(modal.querySelector('.story-shots'), () =>
    shots.map((url) => ({ url, caption: story.title }))
  );
  modal.querySelector('.cat-close').focus();
}

function closeStory() {
  const modal = $('#story');
  modal.classList.remove('open');
  document.body.classList.remove('locked');
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeStory();
});
$('#story')?.addEventListener('click', (e) => {
  if (e.target.id === 'story') closeStory();
});

/* ------------------------------------------------------------------ boot */

const page = document.body.dataset.page;
if (page === 'faq') renderFaq();
else if (page === 'inventory') renderInventory();
else if (page === 'built') renderBuilt();

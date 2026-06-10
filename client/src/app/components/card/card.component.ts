import { Component, Input, OnChanges } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Card, Suit } from '../../models';

/** Cores do baralho (4 cores, tons sóbrios) */
const SUIT_COLORS: Record<Suit, { main: string; dark: string }> = {
  hearts:   { main: '#a8344a', dark: '#73202f' },
  diamonds: { main: '#bb8a32', dark: '#8a6420' },
  clubs:    { main: '#34705f', dark: '#214c40' },
  spades:   { main: '#474566', dark: '#2e2c45' }
};

/** Caminhos SVG dos naipes (caixa 100x100, centrados em 50,50) */
const SUIT_PATHS: Record<Suit, string> = {
  hearts:
    'M50 86 C22 62 10 46 10 31 C10 18 20 9 31 9 C39 9 46 13 50 20 ' +
    'C54 13 61 9 69 9 C80 9 90 18 90 31 C90 46 78 62 50 86 Z',
  diamonds: 'M50 6 L84 50 L50 94 L16 50 Z',
  spades:
    'M50 8 C70 32 88 46 88 61 C88 73 79 81 69 81 C63 81 57 78 53 73 ' +
    'C53 80 56 87 62 92 L38 92 C44 87 47 80 47 73 C43 78 37 81 31 81 ' +
    'C21 81 12 73 12 61 C12 46 30 32 50 8 Z',
  clubs:
    'M50 7 a17 17 0 0 1 16 23 a17 17 0 1 1 -10 27 c0 12 4 23 10 32 L34 89 ' +
    'c6 -9 10 -20 10 -32 a17 17 0 1 1 -10 -27 A17 17 0 0 1 50 7 Z'
};

/** Posições dos símbolos por valor (cartas 250x350) */
const PIP_LAYOUTS: Record<string, [number, number, boolean][]> = {
  '2': [[125, 100, false], [125, 250, true]],
  '3': [[125, 88, false], [125, 175, false], [125, 262, true]],
  '4': [[82, 100, false], [168, 100, false], [82, 250, true], [168, 250, true]],
  '5': [[82, 100, false], [168, 100, false], [125, 175, false], [82, 250, true], [168, 250, true]],
  '6': [[82, 95, false], [168, 95, false], [82, 175, false], [168, 175, false], [82, 255, true], [168, 255, true]],
  '7': [[82, 95, false], [168, 95, false], [125, 135, false], [82, 175, false], [168, 175, false], [82, 255, true], [168, 255, true]]
};

/** Manilhas fixas do Truco Paulista (baralho limpo) */
const MANILHAS = new Set(['7|diamonds', 'A|spades', '7|hearts', '4|clubs']);

const RANK_LABEL: Record<string, string> = {
  'A': 'A', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7',
  'Q': 'Q', 'J': 'J', 'K': 'K'
};

let uid = 0;

@Component({
  selector: 'app-card',
  standalone: true,
  template: `<span class="card-svg" [innerHTML]="svg"></span>`,
  styles: [`
    :host { display: inline-block; line-height: 0; }
    .card-svg svg { display: block; border-radius: 10%; }
  `]
})
export class CardComponent implements OnChanges {
  @Input() card: Card | null = null;
  @Input() faceDown = false;
  @Input() width = 110;
  /** Baralho sujo: rank da manilha definido pela vira (null = manilhas fixas) */
  @Input() manilhaRank: string | null = null;

  svg: SafeHtml = '';
  private id = `c${uid++}`;

  constructor(private sanitizer: DomSanitizer) {}

  ngOnChanges(): void {
    const h = Math.round(this.width * 1.4);
    const body = this.faceDown || !this.card ? this.backSvg() : this.faceSvg(this.card);
    const raw =
      `<svg width="${this.width}" height="${h}" viewBox="0 0 250 350" ` +
      `xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
    this.svg = this.sanitizer.bypassSecurityTrustHtml(raw);
  }

  private suit(suit: Suit, x: number, y: number, size: number, flip = false, color?: string): string {
    const s = size / 100;
    const rot = flip ? ' rotate(180 50 50)' : '';
    const c = color ?? SUIT_COLORS[suit].main;
    return `<g transform="translate(${x - size / 2} ${y - size / 2}) scale(${s})">` +
      `<path d="${SUIT_PATHS[suit]}" fill="${c}" transform="${rot.trim() || 'rotate(0)'}"/></g>`;
  }

  private faceSvg(card: Card): string {
    const { main, dark } = SUIT_COLORS[card.suit];
    const manilha = this.manilhaRank
      ? card.rank === this.manilhaRank
      : MANILHAS.has(`${card.rank}|${card.suit}`);
    const id = this.id;
    const label = RANK_LABEL[card.rank] ?? card.rank;

    let center = '';
    if (card.rank === 'A') {
      center =
        `<circle cx="125" cy="175" r="78" fill="none" stroke="${main}" stroke-width="4" opacity="0.25"/>` +
        `<circle cx="125" cy="175" r="92" fill="none" stroke="${main}" stroke-width="2" opacity="0.15"/>` +
        this.suit(card.suit, 125, 175, 110);
    } else if (['K', 'Q', 'J'].includes(card.rank)) {
      center = this.royal(card, main, dark, id);
    } else {
      const pips = PIP_LAYOUTS[card.rank] ?? [];
      center = pips.map(([x, y, flip]) => this.suit(card.suit, x, y, 52, flip)).join('');
    }

    const corner = (x: number, y: number, flip: boolean) =>
      `<g transform="translate(${x} ${y})${flip ? ' rotate(180)' : ''}">` +
      `<text x="0" y="0" text-anchor="middle" font-family="'Playfair Display', Georgia, serif" ` +
      `font-weight="700" font-size="46" fill="${main}">${label}</text>` +
      this.suit(card.suit, 0, 22, 30) + `</g>`;

    const manilhaDeco = manilha
      ? `<rect x="6" y="6" width="238" height="338" rx="20" fill="none" ` +
        `stroke="url(#${id}-gold)" stroke-width="6"/>` +
        `<g transform="translate(207 36)">` +
        `<path d="M0 -16 L4.7 -4.9 L16.5 -4.9 L7 2.4 L10.6 13.9 L0 7 L-10.6 13.9 L-7 2.4 L-16.5 -4.9 L-4.7 -4.9 Z" ` +
        `fill="#e9d18a" stroke="#a8842c" stroke-width="1.5"/></g>`
      : '';

    return `
      <defs>
        <linearGradient id="${id}-face" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#fffdf6"/>
          <stop offset="1" stop-color="#f0ebdd"/>
        </linearGradient>
        <linearGradient id="${id}-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#efdc9d"/>
          <stop offset="0.5" stop-color="#d8b45a"/>
          <stop offset="1" stop-color="#a8842c"/>
        </linearGradient>
        <linearGradient id="${id}-royal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${main}"/>
          <stop offset="1" stop-color="${dark}"/>
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="246" height="346" rx="22" fill="url(#${id}-face)"
        stroke="#d8d0ba" stroke-width="2"/>
      <rect x="10" y="10" width="230" height="330" rx="16" fill="none"
        stroke="rgba(168,132,44,0.18)" stroke-width="1.5"/>
      ${corner(34, 48, false)}
      ${corner(216, 302, true)}
      ${center}
      ${manilhaDeco}`;
  }

  /** Figuras Q / J / K — heráldica sóbria */
  private royal(card: Card, main: string, dark: string, id: string): string {
    const icon =
      card.rank === 'K'
        ? `<path d="M-44 14 L-36 -18 L-18 0 L0 -26 L18 0 L36 -18 L44 14 Z"
             fill="url(#${id}-gold)" stroke="#8a6420" stroke-width="2"/>
           <rect x="-44" y="14" width="88" height="9" rx="4" fill="#8a6420"/>
           <circle cx="-36" cy="-22" r="4.5" fill="#efdc9d"/>
           <circle cx="0" cy="-30" r="5.5" fill="#efdc9d"/>
           <circle cx="36" cy="-22" r="4.5" fill="#efdc9d"/>`
        : card.rank === 'Q'
        ? `<path d="M-38 14 L-28 -14 L0 -4 L28 -14 L38 14 Z"
             fill="url(#${id}-gold)" stroke="#8a6420" stroke-width="2"/>
           <rect x="-38" y="14" width="76" height="8" rx="4" fill="#8a6420"/>
           <circle cx="-28" cy="-18" r="4.5" fill="#f4f1e8"/>
           <circle cx="0" cy="-9" r="4.5" fill="#f4f1e8"/>
           <circle cx="28" cy="-18" r="4.5" fill="#f4f1e8"/>`
        : `<path d="M0 -30 L8 -8 L8 16 L-8 16 L-8 -8 Z" fill="#f4f1e8" stroke="#c9c2ae" stroke-width="2"/>
           <rect x="-22" y="14" width="44" height="8" rx="4" fill="url(#${id}-gold)"/>
           <rect x="-5" y="22" width="10" height="16" rx="3" fill="#8a6420"/>`;

    return `
      <rect x="45" y="78" width="160" height="194" rx="16" fill="url(#${id}-royal)" opacity="0.94"/>
      <rect x="53" y="86" width="144" height="178" rx="11" fill="none"
        stroke="rgba(244,241,232,0.4)" stroke-width="1.5"/>
      <rect x="57" y="90" width="136" height="170" rx="9" fill="none"
        stroke="rgba(244,241,232,0.18)" stroke-width="1"/>
      <g transform="translate(125 130)">${icon}</g>
      <text x="125" y="230" text-anchor="middle" font-family="'Playfair Display', Georgia, serif"
        font-weight="700" font-size="86" fill="#f8f5ec">${card.rank}</text>
      ${this.suit(card.suit, 125, 250, 32, false, '#f4f1e8')}`;
  }

  /** Verso da carta — esmeralda com arabescos dourados */
  private backSvg(): string {
    const id = this.id;
    return `
      <defs>
        <linearGradient id="${id}-back" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#0f2e21"/>
          <stop offset="0.55" stop-color="#1d4a37"/>
          <stop offset="1" stop-color="#14382a"/>
        </linearGradient>
        <linearGradient id="${id}-bgold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#efdc9d"/>
          <stop offset="0.5" stop-color="#d8b45a"/>
          <stop offset="1" stop-color="#a8842c"/>
        </linearGradient>
        <pattern id="${id}-trellis" width="34" height="34" patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)">
          <rect width="34" height="34" fill="transparent"/>
          <path d="M0 0 H34 M0 17 H34" stroke="rgba(216,180,90,0.13)" stroke-width="1.5"/>
          <path d="M0 0 V34 M17 0 V34" stroke="rgba(216,180,90,0.13)" stroke-width="1.5"/>
        </pattern>
      </defs>
      <rect x="2" y="2" width="246" height="346" rx="22" fill="url(#${id}-back)"
        stroke="#0a1f16" stroke-width="2"/>
      <rect x="2" y="2" width="246" height="346" rx="22" fill="url(#${id}-trellis)"/>
      <rect x="14" y="14" width="222" height="322" rx="15" fill="none"
        stroke="url(#${id}-bgold)" stroke-width="2.5"/>
      <rect x="22" y="22" width="206" height="306" rx="11" fill="none"
        stroke="rgba(216,180,90,0.35)" stroke-width="1"/>
      <g transform="translate(125 175)">
        <path d="M0 -56 L46 0 L0 56 L-46 0 Z" fill="none"
          stroke="url(#${id}-bgold)" stroke-width="2.5"/>
        <path d="M0 -42 L34 0 L0 42 L-34 0 Z" fill="rgba(216,180,90,0.12)"
          stroke="rgba(216,180,90,0.5)" stroke-width="1"/>
        <text x="0" y="15" text-anchor="middle" font-family="'Playfair Display', Georgia, serif"
          font-weight="700" font-style="italic" font-size="44"
          fill="url(#${id}-bgold)">T</text>
      </g>
      <circle cx="125" cy="86" r="3" fill="rgba(216,180,90,0.55)"/>
      <circle cx="125" cy="264" r="3" fill="rgba(216,180,90,0.55)"/>`;
  }
}

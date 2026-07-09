interface CreditEntry {
  panoLabel: string;
  title: string;
  author: string;
  license: string;
  sourceUrl: string;
  note?: string;
}

// CC BY-SA 4.0 の帰属表示義務を満たすための一覧。CC0 の2枚は本来帰属表示不要だが、
// 出典を一貫して示すためにまとめて掲載する（public/panos/ATTRIBUTION.md と内容を揃えること）。
const CREDITS: CreditEntry[] = [
  {
    panoLabel: 'キャンプ地',
    title: 'Forest Slope',
    author: 'Andreas Mischok',
    license: 'CC0（Poly Haven）',
    sourceUrl: 'https://polyhaven.com/a/forest_slope',
  },
  {
    panoLabel: '川辺',
    title: 'Xanderklinge',
    author: 'Andreas Mischok',
    license: 'CC0（Poly Haven）',
    sourceUrl: 'https://polyhaven.com/a/xanderklinge',
  },
  {
    panoLabel: '雪山',
    title: "Piz d'Err Spherical Panorama",
    author: 'Capricorn4049',
    license: 'CC BY-SA 4.0（Wikimedia Commons）',
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Piz_d%E2%80%99Err_Spherical_Panorama.jpg",
    note: '4096x2048へリサイズして使用。改変版のみ CC BY-SA が継承され、アプリのコードには及ばない。',
  },
];

/**
 * パノラマ写真の作者・ライセンス・出典を列挙する半透明オーバーレイ画面（CC BY-SA の
 * 帰属表示義務を満たす）。Title からボタンで開き、背景クリックまたは閉じるボタンで隠す。
 * ゲームの進行（GameState/Interaction）には関与しない、独立した DOM オーバーレイ。
 */
export class Credits {
  private readonly overlay: HTMLDivElement;
  private visible = false;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.style.position = 'fixed';
    this.overlay.style.inset = '0';
    this.overlay.style.display = 'flex';
    this.overlay.style.alignItems = 'center';
    this.overlay.style.justifyContent = 'center';
    this.overlay.style.background = 'rgba(0, 0, 0, 0.72)';
    this.overlay.style.fontFamily = 'sans-serif';
    this.overlay.style.color = '#fff';
    this.overlay.style.pointerEvents = 'auto';
    this.overlay.style.zIndex = '20';

    this.overlay.addEventListener('click', (event) => {
      if (event.target === this.overlay) this.hide();
    });

    const panel = document.createElement('div');
    panel.style.background = 'rgba(20, 20, 20, 0.92)';
    panel.style.border = '1px solid rgba(255, 255, 255, 0.25)';
    panel.style.borderRadius = '12px';
    panel.style.padding = '2rem 2.4rem';
    panel.style.maxWidth = '32rem';
    panel.style.maxHeight = '80vh';
    panel.style.overflowY = 'auto';

    const heading = document.createElement('div');
    heading.textContent = '写真クレジット';
    heading.style.fontSize = '1.3rem';
    heading.style.letterSpacing = '0.05em';
    heading.style.marginBottom = '1.4rem';
    panel.appendChild(heading);

    for (const credit of CREDITS) {
      panel.appendChild(this.buildEntry(credit));
    }

    const closeButton = document.createElement('button');
    closeButton.textContent = '閉じる';
    closeButton.style.marginTop = '1rem';
    closeButton.style.padding = '0.5rem 1.2rem';
    closeButton.style.fontSize = '0.95rem';
    closeButton.style.color = '#fff';
    closeButton.style.background = 'rgba(255, 255, 255, 0.12)';
    closeButton.style.border = '1px solid rgba(255, 255, 255, 0.5)';
    closeButton.style.borderRadius = '999px';
    closeButton.style.cursor = 'pointer';
    closeButton.addEventListener('click', () => this.hide());
    panel.appendChild(closeButton);

    this.overlay.appendChild(panel);
  }

  private buildEntry(credit: CreditEntry): HTMLDivElement {
    const entry = document.createElement('div');
    entry.style.marginBottom = '1.2rem';
    entry.style.paddingBottom = '1.2rem';
    entry.style.borderBottom = '1px solid rgba(255, 255, 255, 0.15)';
    entry.style.fontSize = '0.9rem';
    entry.style.lineHeight = '1.6';

    const label = document.createElement('div');
    label.textContent = credit.panoLabel;
    label.style.fontSize = '0.8rem';
    label.style.opacity = '0.65';
    label.style.marginBottom = '0.3rem';
    entry.appendChild(label);

    const title = document.createElement('div');
    title.textContent = credit.title;
    title.style.fontSize = '1rem';
    entry.appendChild(title);

    const author = document.createElement('div');
    author.textContent = `作者: ${credit.author} / ライセンス: ${credit.license}`;
    entry.appendChild(author);

    const link = document.createElement('a');
    link.href = credit.sourceUrl;
    link.textContent = credit.sourceUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.style.color = '#9cc8ff';
    link.style.wordBreak = 'break-all';
    link.style.display = 'block';
    entry.appendChild(link);

    if (credit.note) {
      const note = document.createElement('div');
      note.textContent = credit.note;
      note.style.opacity = '0.6';
      note.style.fontSize = '0.8rem';
      note.style.marginTop = '0.3rem';
      entry.appendChild(note);
    }

    return entry;
  }

  show(): void {
    if (this.visible) return;
    this.visible = true;
    document.getElementById('ui-root')?.appendChild(this.overlay);
  }

  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.overlay.remove();
  }

  toggle(): void {
    if (this.visible) this.hide();
    else this.show();
  }
}

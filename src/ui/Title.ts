export class Title {
  private readonly element: HTMLDivElement;

  constructor(onStart: () => void, onUnlock?: () => void) {
    this.element = document.createElement('div');
    this.element.style.position = 'fixed';
    this.element.style.inset = '0';
    this.element.style.display = 'flex';
    this.element.style.flexDirection = 'column';
    this.element.style.alignItems = 'center';
    this.element.style.justifyContent = 'center';
    this.element.style.gap = '1.2rem';
    this.element.style.textAlign = 'center';
    this.element.style.background = '#000';
    this.element.style.color = '#fff';
    this.element.style.fontFamily = 'sans-serif';
    this.element.style.cursor = 'pointer';
    this.element.style.pointerEvents = 'auto';

    const heading = document.createElement('div');
    heading.textContent = 'Takibi';
    heading.style.fontSize = '2.2rem';
    heading.style.letterSpacing = '0.1em';

    const startHint = document.createElement('div');
    startHint.textContent = 'クリックではじめる';
    startHint.style.fontSize = '1.1rem';

    const controls = document.createElement('div');
    controls.textContent = 'マウスドラッグで見回す';
    controls.style.fontSize = '0.9rem';
    controls.style.opacity = '0.75';

    this.element.append(heading, startHint, controls);

    this.element.addEventListener('click', () => {
      onUnlock?.();
      this.hide();
      onStart();
    });
  }

  show(): void {
    document.getElementById('ui-root')?.appendChild(this.element);
  }

  hide(): void {
    this.element.remove();
  }
}

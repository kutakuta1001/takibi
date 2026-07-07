export class Title {
  private readonly element: HTMLDivElement;
  private readonly onStart: () => void;
  private readonly handlePointerLockChange = (): void => {
    if (document.pointerLockElement === document.body) {
      this.hide();
      this.onStart();
    }
  };

  constructor(onStart: () => void, onUnlock?: () => void) {
    this.onStart = onStart;

    this.element = document.createElement('div');
    this.element.style.position = 'fixed';
    this.element.style.inset = '0';
    this.element.style.display = 'flex';
    this.element.style.alignItems = 'center';
    this.element.style.justifyContent = 'center';
    this.element.style.background = '#000';
    this.element.style.color = '#fff';
    this.element.style.fontFamily = 'sans-serif';
    this.element.style.fontSize = '1.5rem';
    this.element.style.cursor = 'pointer';
    this.element.style.pointerEvents = 'auto';
    this.element.textContent = 'Takibi — クリックではじめる';

    this.element.addEventListener('click', () => {
      onUnlock?.();
      document.body.requestPointerLock();
    });

    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
  }

  show(): void {
    document.getElementById('ui-root')?.appendChild(this.element);
  }

  hide(): void {
    this.element.remove();
  }
}

declare module 'alea' {
  interface AleaState {
    c: number;
    s0: number;
    s1: number;
    s2: number;
  }

  interface AleaRandom {
    (): number;
    uint32(): number;
    fract53(): number;
    exportState(): AleaState;
    importState(state: AleaState): AleaRandom;
  }

  function Alea(...seeds: Array<string | number>): AleaRandom;

  export default Alea;
}

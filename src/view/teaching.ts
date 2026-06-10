import type { StageName } from '../core/solver/types';

export interface StageLesson {
  /** What the cube looks like once this stage is done (1 line). */
  readonly goal: string;
  /** Why this stage exists and why it comes here in the method (1-2 lines). */
  readonly why: string;
}

// Why layer-by-layer at all — shown as framing before a solve starts.
export const METHOD_INTRO: string =
  "This is the beginner layer-by-layer method: solve the cube one layer at a " +
  "time, bottom to top. Each stage locks in progress without disturbing what's " +
  'already solved — building from a white cross up to the final yellow layer.';

// One lesson per StageName. Keyed by name (not index) so it stays correct even
// if STAGE_NAMES order ever changes.
export const STAGE_LESSONS: Record<StageName, StageLesson> = {
  Daisy: {
    goal: 'A daisy on top: four white edges arranged around the yellow center.',
    why:
      'Making the white cross directly is fiddly. A daisy is easy to build first, ' +
      'and each white petal then drops straight down into its place on the cross.',
  },
  Cross: {
    goal: 'A white cross on the bottom, each edge matching its side center.',
    why:
      'Folding the daisy petals down gives a solved cross aligned to the centers. ' +
      'This is the foundation every later stage builds on.',
  },
  'First Layer': {
    goal: 'The whole bottom (white) layer done — cross plus its four corners.',
    why:
      'We slot the four white corners between the cross and their matching side ' +
      'colors, finishing the first layer so the cube has a solid solved base.',
  },
  'Second Layer': {
    goal: 'The middle layer solved — its four edges seated in place.',
    why:
      'We bring the middle-layer edges down from the top without disturbing the ' +
      'finished first layer, leaving only the last (yellow) layer to go.',
  },
  OLL: {
    goal: 'The entire top face one solid color (yellow).',
    why:
      'OLL means Orient Last Layer. We make the top all-yellow first — getting ' +
      'every piece facing the right way before worrying about where it belongs.',
  },
  PLL: {
    goal: 'The last layer fully solved — the whole cube complete.',
    why:
      'PLL means Permute Last Layer. With the top oriented, we shuffle the ' +
      'last-layer pieces into their correct positions to finish the solve.',
  },
};

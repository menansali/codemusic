import type { SceneOf, SceneType, Storyboard } from '../schema/storyboard';
import type { SceneTiming } from '../schema/timeline';

export type SceneProps<T extends SceneType> = {
  scene: SceneOf<T>;
  storyboard: Storyboard;
  timing: SceneTiming;
};

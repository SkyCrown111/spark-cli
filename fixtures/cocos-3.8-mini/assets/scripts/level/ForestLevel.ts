// @spark-cli-generated
// path: assets/scripts/level/ForestLevel.ts
import { _decorator, Component, JsonAsset, resources } from 'cc';
const { ccclass } = _decorator;

export interface LevelZone { id: string; x: number; y: number; w: number; h: number; label?: string }
export interface LevelPath { id: string; points: [number, number][] }
export interface LevelEntity { type: string; zoneId: string; count?: number }

export interface LevelData {
  version: 1;
  name: string;
  zones: LevelZone[];
  paths: LevelPath[];
  entities: LevelEntity[];
}

@ccclass('ForestLevel')
export class ForestLevel extends Component {
  levelAsset: JsonAsset | null = null;

  data: LevelData | null = null;

  onLoad() {
    if (this.levelAsset?.json) {
      this.data = this.levelAsset.json as LevelData;
      return;
    }
    resources.load('levels/forest', JsonAsset, (err, asset) => {
      if (!err && asset) this.data = asset.json as LevelData;
    });
  }

  getZone(id: string) {
    return this.data?.zones.find((z) => z.id === id);
  }
}

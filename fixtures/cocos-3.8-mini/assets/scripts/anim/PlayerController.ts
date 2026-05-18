// @spark-cli-generated
// path: assets/scripts/anim/PlayerController.ts
import { _decorator, Component, JsonAsset } from 'cc';
const { ccclass } = _decorator;

type AnimStateId = 'Idle' | 'Run' | 'Jump';

@ccclass('PlayerController')
export class PlayerController extends Component {
  graphAsset: JsonAsset | null = null;

  state: AnimStateId = 'Idle';
  speed = 0;

  private graph = {
  "version": 1,
  "name": "player",
  "parameters": [
    {
      "name": "Speed",
      "type": "float",
      "default": 0
    },
    {
      "name": "IsGrounded",
      "type": "bool",
      "default": true
    },
    {
      "name": "Jump",
      "type": "trigger"
    }
  ],
  "states": [
    {
      "id": "Idle",
      "motion": "idle",
      "speed": 1
    },
    {
      "id": "Run",
      "motion": "run",
      "speed": 1
    },
    {
      "id": "Jump",
      "motion": "jump",
      "speed": 1
    }
  ],
  "transitions": [
    {
      "from": "Idle",
      "to": "Run",
      "condition": "Speed > 0.1",
      "duration": 0.15
    },
    {
      "from": "Run",
      "to": "Jump",
      "condition": "RunComplete",
      "duration": 0.15
    },
    {
      "from": "Jump",
      "to": "Idle",
      "condition": "Speed < 0.05",
      "duration": 0.2
    }
  ],
  "meta": {
    "generatedBy": "spark-cli",
    "spec": "Idle->Run->Jump"
  }
};

  update(dt: number) {
    const speed = this.speed;
    for (const t of this.graph.transitions) {
      if (t.from !== this.state) continue;
      if (t.condition === 'Speed > 0.1' && speed > 0.1) {
        this.state = t.to as AnimStateId;
        break;
      }
      if (t.condition === 'Speed < 0.05' && speed < 0.05) {
        this.state = t.to as AnimStateId;
        break;
      }
    }
  }
}

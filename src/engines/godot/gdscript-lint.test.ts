import { describe, it, expect } from 'vitest';
import { lintGdScriptText } from './gdscript-lint.js';

describe('lifecycle-typo', () => {
  it('flags _read() as a typo of _ready', () => {
    const issues = lintGdScriptText('extends Node\n\nfunc _read() -> void:\n\tpass\n');
    expect(issues.find((i) => i.rule === 'lifecycle-typo')).toBeDefined();
  });

  it('does not flag legitimate lifecycle names', () => {
    const issues = lintGdScriptText('func _ready():\n\tpass\nfunc _process(d):\n\tpass\n');
    expect(issues.filter((i) => i.rule === 'lifecycle-typo')).toHaveLength(0);
  });
});

describe('onready-misuse', () => {
  it('flags @onready that does not annotate a var', () => {
    const issues = lintGdScriptText('@onready\nfunc do_thing():\n\tpass\n');
    expect(issues.find((i) => i.rule === 'onready-misuse')).toBeDefined();
  });

  it('passes @onready var', () => {
    const issues = lintGdScriptText('@onready var x = $Node\n');
    expect(issues.filter((i) => i.rule === 'onready-misuse')).toHaveLength(0);
  });
});

describe('stray-await', () => {
  it('flags await at top level of file', () => {
    const issues = lintGdScriptText('await something()\n');
    expect(issues.find((i) => i.rule === 'stray-await')).toBeDefined();
  });

  it('allows await inside a func', () => {
    const issues = lintGdScriptText('func go():\n\tawait something()\n');
    expect(issues.filter((i) => i.rule === 'stray-await')).toHaveLength(0);
  });
});

describe('dangling-signal', () => {
  it('warns when a connect has no matching disconnect', () => {
    const issues = lintGdScriptText(
      'func _ready():\n\tbutton.connect("pressed", _on)\nfunc _on():\n\tpass\n',
    );
    expect(issues.find((i) => i.rule === 'dangling-signal')).toBeDefined();
  });

  it('quiet when disconnect is present', () => {
    const issues = lintGdScriptText(
      'func _ready():\n\tbutton.connect("pressed", _on)\nfunc _exit_tree():\n\tbutton.disconnect("pressed", _on)\n',
    );
    expect(issues.filter((i) => i.rule === 'dangling-signal')).toHaveLength(0);
  });
});

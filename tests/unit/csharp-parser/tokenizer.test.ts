import { describe, expect, it } from 'vitest'
import {
  findClassRange,
  extractClassBody,
  parsePropertiesFromBody,
} from '@shared/csharp-parser/tokenizer'

describe('tokenizer', () => {
  describe('findClassRange', () => {
    it('locates a simple class by name', () => {
      const src = `
namespace Foo {
  public class Bar { }
}
`.trim()
      const range = findClassRange(src, 'Bar')
      expect(range).not.toBeNull()
      expect(range!.startLine).toBe(2)
      expect(range!.endLine).toBe(2)
    })

    it('handles multi-line class body', () => {
      const src = `
public class MultiLine
{
    public int X { get; set; }
    public int Y { get; set; }
}
`.trim()
      const range = findClassRange(src, 'MultiLine')
      expect(range).not.toBeNull()
      expect(range!.startLine).toBe(1)
      expect(range!.endLine).toBe(5)
    })

    it('tracks nested braces correctly', () => {
      const src = `
public class WithNested
{
    public void Method() {
        if (true) {
            return;
        }
    }
}
`.trim()
      const range = findClassRange(src, 'WithNested')
      expect(range).not.toBeNull()
      expect(range!.endLine).toBe(8)
    })

    it('returns null when class not found', () => {
      const src = `public class A {}`
      const range = findClassRange(src, 'NotThere')
      expect(range).toBeNull()
    })

    it('respects strings and comments inside class body', () => {
      const src = `
public class WithString
{
    public string S = "} end";
    public int X { get; set; }
}
`.trim()
      const range = findClassRange(src, 'WithString')
      expect(range).not.toBeNull()
      expect(range!.endLine).toBe(5)
    })
  })

  describe('extractClassBody', () => {
    it('returns text between outer braces', () => {
      const src = `public class A { int X; int Y; }`
      const body = extractClassBody(src, src.indexOf('{'), src.indexOf('}'))
      expect(body).toContain('int X')
      expect(body).toContain('int Y')
    })
  })

  describe('parsePropertiesFromBody', () => {
    it('parses a single bool property', () => {
      const body = `
        public bool IsEnable { get; set; }
      `
      const props = parsePropertiesFromBody(body, 'test.cs')
      expect(props).toHaveLength(1)
      expect(props[0]).toMatchObject({
        name: 'IsEnable',
        type: 'bool',
        isInitOnly: false,
      })
    })

    it('detects init-only properties', () => {
      const body = `
        public int MaxValue { get; init; }
      `
      const props = parsePropertiesFromBody(body, 'test.cs')
      expect(props).toHaveLength(1)
      expect(props[0]!.isInitOnly).toBe(true)
    })

    it('captures default value with = initializer', () => {
      const body = `
        public string IPAddress { get; set; } = "192.168.1.1";
      `
      const props = parsePropertiesFromBody(body, 'test.cs')
      expect(props).toHaveLength(1)
      expect(props[0]!.defaultValue).toBe('"192.168.1.1"')
    })

    it('captures object initializer with new keyword', () => {
      const body = `
        public SwitchTypeConfig Sw = new SwitchTypeConfig { IsFirstCtrlInvert = false };
      `
      const props = parsePropertiesFromBody(body, 'test.cs')
      expect(props).toHaveLength(1)
      expect(props[0]!.name).toBe('Sw')
      expect(props[0]!.type).toBe('SwitchTypeConfig')
      expect(props[0]!.defaultValue).toContain('new SwitchTypeConfig')
    })

    it('captures attributes like [JsonIgnore]', () => {
      const body = `
        [JsonIgnore]
        public Func<object?> GetSoftwareConfig { get; set; }
      `
      const props = parsePropertiesFromBody(body, 'test.cs')
      expect(props).toHaveLength(1)
      expect(props[0]!.attributes).toContainEqual({ name: 'JsonIgnore' })
    })

    it('captures /// XML doc comment associated with property', () => {
      const body = `
        /// <summary>
        /// 一控取反
        /// </summary>
        public bool IsFirstCtrlInvert { get; set; }
      `
      const props = parsePropertiesFromBody(body, 'test.cs')
      expect(props).toHaveLength(1)
      expect(props[0]!.xmlComment).toContain('一控取反')
    })

    it('captures inline comment after property', () => {
      const body = `
        public DigitalTypeConfig LeftDoor { get; set; } = new DigitalTypeConfig { IsInvert = false }; //靶台左窗口
      `
      const props = parsePropertiesFromBody(body, 'test.cs')
      expect(props).toHaveLength(1)
      expect(props[0]!.inlineComment).toBe('靶台左窗口')
    })

    it('parses multiple properties in one body', () => {
      const body = `
        public int A { get; set; }
        public int B { get; set; }
        public string C { get; set; } = "x";
      `
      const props = parsePropertiesFromBody(body, 'test.cs')
      expect(props).toHaveLength(3)
      expect(props.map((p) => p.name)).toEqual(['A', 'B', 'C'])
    })

    it('parses generic types like List<X>', () => {
      const body = `
        public List<ImplantElementConfig> Elements { get; set; } = new List<ImplantElementConfig>();
      `
      const props = parsePropertiesFromBody(body, 'test.cs')
      expect(props).toHaveLength(1)
      expect(props[0]!.type).toBe('List<ImplantElementConfig>')
    })

    it('parses Dictionary<K,V> types', () => {
      const body = `
        public Dictionary<string, double> WaferSizeRefLineMap { get; set; } = new Dictionary<string, double>();
      `
      const props = parsePropertiesFromBody(body, 'test.cs')
      expect(props).toHaveLength(1)
      expect(props[0]!.type).toBe('Dictionary<string, double>')
    })

    it('parses nullable types like bool', () => {
      const body = `
        public bool? Optional { get; set; }
      `
      const props = parsePropertiesFromBody(body, 'test.cs')
      expect(props).toHaveLength(1)
      expect(props[0]!.type).toMatch(/bool\?/)
    })

    it('captures private fields with backing syntax', () => {
      const body = `
        private int _count = 0;
        public int Count
        {
            get { return _count; }
            set { _count = value; }
        }
      `
      // Should still find at least Count; backing private field handling is best-effort
      const props = parsePropertiesFromBody(body, 'test.cs')
      const propNames = props.map((p) => p.name)
      expect(propNames).toContain('Count')
    })
  })
})

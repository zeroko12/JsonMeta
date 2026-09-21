/**
 * Type definitions for parsed C# classes and their members.
 * Used by the schema extractor script (extract-schema.mjs).
 */

export interface CSharpAttribute {
  name: string
  args?: string
}

/**
 * One property inside a C# class body. Captures everything needed to
 * generate a corresponding schema field.
 */
export interface CSharpProperty {
  /** Property name as it appears in C# (e.g. "IsFirstCtrlInvert"). */
  name: string
  /** Raw C# type name (e.g. "SwitchTypeConfig", "int", "List<ImplantElementConfig>"). */
  type: string
  /** True when the property is `{ get; init; }` (init-only). */
  isInitOnly: boolean
  /** Raw C# initializer expression as a string (e.g. "true", "new SwitchTypeConfig()"). */
  defaultValue?: string
  /** Attributes applied to the property (e.g. ["JsonIgnore"]). */
  attributes: CSharpAttribute[]
  /** Joined /// XML doc summary text. */
  xmlComment?: string
  /** Inline `//` comment immediately after the property. */
  inlineComment?: string
  /** Source line number where this property was found (1-indexed). */
  line: number
}

/**
 * Parsed C# class with its members and metadata.
 */
export interface CSharpClass {
  /** Class name. */
  name: string
  /** Optional /// XML doc above the class. */
  xmlComment?: string
  /** Optional namespace declaration. */
  namespace?: string
  /** Properties defined on the class. */
  properties: CSharpProperty[]
  /** Source file path. */
  sourceFile: string
  /** 1-indexed start line in source. */
  startLine: number
  /** 1-indexed end line in source. */
  endLine: number
}

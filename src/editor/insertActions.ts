import type { Editor, Range } from '@tiptap/core'
import type { CatalogKind, ExpressionDef, VariableDef } from '../data/types'
import { NODE_TYPE_FOR, uid } from '../data/reports'
import { getRecord, useApp } from '../store/store'

export interface InsertPick {
  kind: CatalogKind
  assetId: string
  revision: number
}

export type BlockAction = 'paragraph' | 'h1' | 'h2' | 'h3' | 'bullet' | 'ordered' | 'quote' | 'hr'

/** The single insertion path shared by the toolbar, the ResourcePicker and the `/` menu. */
export function insertPick(editor: Editor, pick: InsertPick, range?: Range) {
  const chain = editor.chain().focus()
  if (range) chain.deleteRange(range)
  if (pick.kind === 'chart' || pick.kind === 'table' || pick.kind === 'fixed') {
    chain.insertContent({ type: NODE_TYPE_FOR[pick.kind], attrs: { assetId: pick.assetId, assetRevision: pick.revision, overrides: {}, displayMode: 'inline', nodeId: uid('N') } })
  } else if (pick.kind === 'variable') {
    const def = getRecord(useApp.getState(), pick.assetId)?.revisions.find((r) => r.revision === pick.revision)?.def as VariableDef | undefined
    chain.insertContent([{ type: 'variable', attrs: { name: def?.name ?? pick.assetId, assetId: pick.assetId, revision: pick.revision } }, { type: 'text', text: ' ' }])
  } else if (pick.kind === 'expression') {
    const def = getRecord(useApp.getState(), pick.assetId)?.revisions.find((r) => r.revision === pick.revision)?.def as ExpressionDef | undefined
    chain.insertContent([{ type: 'expressionRef', attrs: { assetId: pick.assetId, revision: pick.revision, name: def?.name ?? null } }, { type: 'text', text: ' ' }])
  }
  return chain.run()
}

export function runBlock(editor: Editor, action: BlockAction, range?: Range) {
  const c = editor.chain().focus()
  if (range) c.deleteRange(range)
  switch (action) {
    case 'paragraph':
      return c.setParagraph().run()
    case 'h1':
      return c.setHeading({ level: 1 }).run()
    case 'h2':
      return c.setHeading({ level: 2 }).run()
    case 'h3':
      return c.setHeading({ level: 3 }).run()
    case 'bullet':
      return c.toggleBulletList().run()
    case 'ordered':
      return c.toggleOrderedList().run()
    case 'quote':
      return c.toggleBlockquote().run()
    case 'hr':
      return c.setHorizontalRule().run()
  }
}

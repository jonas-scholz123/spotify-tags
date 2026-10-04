import { describe, expect, it } from 'vitest'
import { describeSelection, facetCounts, matchTracks, type Tag } from './filter'

const tag = (id: string, keys: string[]): Tag => ({ id, name: id, trackKeys: new Set(keys) })

const tags = [
  tag('chill', ['a', 'b', 'c', 'd']),
  tag('banger', ['d', 'c', 'e']),
  tag('vocal', ['c', 'd', 'f']),
  tag('karaoke', ['d']),
]

const select = (...ids: string[]) => new Set(ids)

describe('matchTracks', () => {
  it('returns nothing when no tag is selected', () => {
    expect(matchTracks(tags, select())).toEqual([])
  })

  it('returns a single selected tag unchanged', () => {
    expect(matchTracks(tags, select('chill'))).toEqual(['a', 'b', 'c', 'd'])
  })

  it('intersects all selected tags, keeping the first selected tag’s order', () => {
    expect(matchTracks(tags, select('banger', 'chill', 'vocal'))).toEqual(['c', 'd'])
    expect(matchTracks(tags.slice(1), select('banger', 'vocal'))).toEqual(['d', 'c'])
    expect(matchTracks(tags, select('chill', 'banger', 'vocal', 'karaoke'))).toEqual(['d'])
  })

  it('returns nothing when the selected tags share no track', () => {
    const disjoint = [tag('x', ['a']), tag('y', ['b'])]
    expect(matchTracks(disjoint, select('x', 'y'))).toEqual([])
  })

  it('ignores selected ids for unknown tags', () => {
    expect(matchTracks(tags, select('chill', 'gone'))).toHaveLength(4)
  })
})

describe('facetCounts', () => {
  it('counts each tag alone when nothing is selected', () => {
    expect(Object.fromEntries(facetCounts(tags, select()))).toEqual({
      chill: 4,
      banger: 3,
      vocal: 3,
      karaoke: 1,
    })
  })

  it('counts what would remain if each tag were added', () => {
    const counts = facetCounts(tags, select('chill'))
    expect(counts.get('banger')).toBe(2)
    expect(counts.get('karaoke')).toBe(1)
    expect(counts.get('chill')).toBe(4)
  })
})

describe('describeSelection', () => {
  it('lists the selected tags in tag order', () => {
    expect(describeSelection(tags, select('vocal', 'chill'))).toBe('chill + vocal')
  })
})

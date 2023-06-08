import { MonoidRbTree } from "../monoid_rbtree/monoid_rbtree.ts";
import { assertEquals } from "https://deno.land/std@0.158.0/testing/asserts.ts";
import { Skiplist } from "./monoid_skiplist.ts";
import { concatMonoid } from "../lifting_monoid.ts";
import { KvDriverDeno } from "../kv/kv_driver_deno.ts";

// The range, the fingerprint, size, collected items.
type RangeVector = [[string, string], string, number, string[]];

const rangeVectors: RangeVector[] = [
  [["a", "a"], "abcdefg", 7, ["a", "b", "c", "d", "e", "f", "g"]],
  [["a", "d"], "abc", 3, ["a", "b", "c"]],
  [["g", "a"], "g", 1, ["g"]],
  [["c", "a"], "cdefg", 5, ["c", "d", "e", "f", "g"]],
  [["c", "g"], "cdef", 4, ["c", "d", "e", "f"]],
  [["e", "a"], "efg", 3, ["e", "f", "g"]],
  [["b", "b"], "abcdefg", 7, ["a", "b", "c", "d", "e", "f", "g"]],
  [["c", "b"], "acdefg", 6, ["a", "c", "d", "e", "f", "g"]],
  [["e", "b"], "aefg", 4, ["a", "e", "f", "g"]],
  [["m", "d"], "abc", 3, ["a", "b", "c"]],
  [["m", "z"], "", 0, []],
  [["f", "z"], "fg", 2, ["f", "g"]],
];

const compare = (a: string, b: string) => {
  if (a > b) {
    return 1;
  } else if (a < b) {
    return -1;
  } else {
    return 0;
  }
};

Deno.test("Skiplist storage", async () => {
  const kv = await Deno.openKv();
  const driver = new KvDriverDeno(kv);

  await driver.clear();

  const skiplist = new Skiplist(
    {
      monoid: concatMonoid,
      compare,
      kv: driver,
    },
  );

  const encoder = new TextEncoder();

  const keys = ["a", "b", "c", "d", "e", "f", "g"];

  const map = new Map();

  for (const letter of keys) {
    map.set(letter, encoder.encode(letter));
  }

  for (const [key, value] of map) {
    await skiplist.insert(key, value);
  }

  const listContents = [];

  for await (const item of skiplist.allEntries()) {
    listContents.push(item.value);
  }

  assertEquals(Array.from(map.values()), listContents);

  for (const [key, value] of map) {
    const storedValue = await skiplist.get(key);

    assertEquals(storedValue, value);
  }

  kv.close();
});

Deno.test("Skiplist summarise (basics)", async () => {
  const kv = await Deno.openKv();
  const driver = new KvDriverDeno(kv);

  await driver.clear();

  const skiplist = new Skiplist(
    {
      monoid: concatMonoid,
      compare,
      kv: driver,
    },
  );

  const set = ["a", "b", "c", "d", "e", "f", "g"];

  for (const item of set) {
    await skiplist.insert(item, new Uint8Array());
  }

  for (const vector of rangeVectors) {
    const items = [];

    for await (const entry of skiplist.entries(vector[0][0], vector[0][1])) {
      items.push(entry.key);
    }

    assertEquals(
      items,
      vector[3],
    );

    const { fingerprint, size } = await skiplist.summarise(
      vector[0][0],
      vector[0][1],
    );

    assertEquals(
      [fingerprint, size],
      [vector[1], vector[2]],
    );
  }

  kv.close();
});

const letters = [
  "a",
  "b",
  "c",
  "d",
  "e",
  "f",
  "g",
  "h",
  "i",
  "j",
  "k",
  "l",
  "m",
  "n",
  "o",
  "p",
  "q",
  "r",
  "s",
  "t",
  "u",
  "v",
  "w",
  "x",
  "y",
  "z",
];

function makeRandomSet() {
  const newSet: string[] = [];

  const threshold = Math.random();

  for (const letter of letters) {
    if (Math.random() > threshold) {
      newSet.push(letter);
    }
  }

  if (newSet.length === 0) {
    newSet.push(
      letters[
        Math.floor(Math.random() * letters.length)
      ],
    );
  }

  return newSet;
}

function makeRandomRange(set: string[]) {
  const startIndex = Math.floor(Math.random() * set.length);
  const endIndex = Math.floor(Math.random() * set.length);

  return { start: set[startIndex], end: set[endIndex] };
}

function makeRandomItemsQuery(set: string[]) {
  const startIndex = Math.random() > 0.1
    ? Math.floor(Math.random() * set.length)
    : undefined;
  const endIndex = Math.random() > 0.1
    ? Math.floor(Math.random() * set.length)
    : undefined;

  return {
    start: startIndex ? set[startIndex] : undefined,
    end: endIndex ? set[endIndex] : undefined,
    reverse: Math.random() > 0.5 ? true : false,
    limit: Math.random() > 0.5
      ? Math.floor(Math.random() * (set.length - 1 + 1) + 1)
      : undefined,
  };
}

Deno.test("Skiplist summarise (fuzz 10k)", async () => {
  const sets: string[][] = [];

  for (let i = 0; i < 100; i++) {
    sets.push(makeRandomSet());
  }

  for (const set of sets) {
    const tree = new MonoidRbTree({ monoid: concatMonoid, compare });

    const kv = await Deno.openKv();
    const driver = new KvDriverDeno(kv);

    await driver.clear();

    const skiplist = new Skiplist(
      {
        monoid: concatMonoid,
        compare,
        kv: driver,
      },
    );

    for (const item of set) {
      await tree.insert(item, new Uint8Array());
      await skiplist.insert(item, new Uint8Array());
    }

    // Randomly delete an element.

    const toDelete = set[Math.floor(Math.random() * set.length)];

    const treeItems = [];
    const listItems = [];

    for await (const treeValue of tree.allEntries()) {
      treeItems.push(treeValue.key);
    }

    for await (const listValue of skiplist.allEntries()) {
      listItems.push(listValue.key);
    }

    tree.remove(toDelete);
    await skiplist.remove(toDelete);

    assertEquals(treeItems, listItems);

    for (let i = 0; i < 100; i++) {
      const { start, end } = makeRandomRange(set);

      const treeFingerprint = await tree.summarise(start, end);
      const listFingeprint = await skiplist.summarise(start, end);

      assertEquals(
        listFingeprint,
        treeFingerprint,
      );

      const listItems = [];

      for await (const entry of skiplist.entries(start, end)) {
        listItems.push(entry.key);
      }

      const treeItems = [];

      for await (const entry of tree.entries(start, end)) {
        treeItems.push(entry.key);
      }

      assertEquals(
        listItems,
        treeItems,
      );

      const randomQuery = makeRandomItemsQuery(set);

      const queryListItems = [];

      for await (
        const entry of skiplist.entries(randomQuery.start, randomQuery.end, {
          limit: randomQuery.limit,
          reverse: randomQuery.reverse,
        })
      ) {
        queryListItems.push(entry.key);
      }

      const queryTreeItems = [];

      for await (
        const entry of tree.entries(randomQuery.start, randomQuery.end, {
          limit: randomQuery.limit,
          reverse: randomQuery.reverse,
        })
      ) {
        queryTreeItems.push(entry.key);
      }

      assertEquals(
        queryListItems,
        queryTreeItems,
      );
    }

    kv.close();
  }
});

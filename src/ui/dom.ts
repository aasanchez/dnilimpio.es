// SPDX-License-Identifier: AGPL-3.0-or-later
// DOM is built with createElement/textContent only: no HTML strings, so Trusted Types needs no policy.

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { text?: string; className?: string; id?: string } = {},
  ...children: Node[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.text !== undefined) node.textContent = props.text;
  if (props.className !== undefined) node.className = props.className;
  if (props.id !== undefined) node.id = props.id;
  node.append(...children);
  return node;
}

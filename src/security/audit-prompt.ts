// SPDX-License-Identifier: AGPL-3.0-or-later
// The prompt the start screen offers to copy into an AI coding agent, so anyone can check the
// privacy claim against the source code and the live site instead of taking it on trust. English
// on purpose: coding agents work best with it, and the code it points at is in English.
// Keep it to one question and a closing question, and neutral: it says where to look and what to answer. It states no
// claim, does not explain why something is fine and does not answer findings in advance. It limits
// the question to the document, so the opt-in usage stats are not reported as a document leak,
// but still in scope if they carry anything from the document. It ends with a final question
// whose answer is the conclusion, in plain words for people who are not technical.
/** The repository the prompt asks the agent to read. */
export const REPOSITORY = 'https://github.com/aasanchez/dnitapado.es'
/** The live site the prompt asks the agent to check against the repository. */
export const LIVE_SITE = 'https://dnitapado.es/'

export const AUDIT_PROMPT = `Read the code at ${REPOSITORY} and check the live site built from it, ${LIVE_SITE}.

Is my document (the photos I load and any data read from them) ever handled by a third party, or by any system or server outside my device?

Answer only about the document. The opt-in anonymous usage statistics are out of scope, unless they carry data from the document.

To conclude, answer in plain, non-technical words: is this site reasonably safe for keeping my personal identity data private?
`

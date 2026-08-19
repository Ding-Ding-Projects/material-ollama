# Local Chat Sessions

## Behaviour

Chat sessions are real and SQLite-backed. `app/store/database.go`'s `saveChat`/`getChatWithOptions`/`deleteChat` (L727-L845) persist each chat's title, creation time, and messages, with cascade deletion of a chat's messages proven by `database_test.go`'s `TestChatDeletionWithCascade` (it creates a chat with two messages, deletes the chat, and asserts both the chat row and its orphaned messages are gone). On the frontend, the `/c/$chatId` route (`app/ui/app/src/routes/c.$chatId.tsx`) hosts `Chat.tsx` for the actual message thread and model picker, while `ChatSidebar.tsx` lists every session with working rename (`useRenameChat`, a real `PATCH`-style API call) and delete actions, and a "New chat" entry point that lands on `/c/new` -- the exact screen this inventory's `c-new.png` capture shows: an empty thread with a model picker and a message composer, ready for the first message.

One real, notable gap: `Chat.tsx` and `ChatSidebar.tsx` do not use the app's `uh` localization layer at all -- no `useT`/`Txt` call was found in either file. `app/ui/app/src/uh/dict/app.dict.ts` does define `newChat`/`searchChats`/`clearChats` dictionary entries, complete with Cantonese translations, but a repo-wide search finds no call site that ever renders them; they are dead entries today. So the chat surface itself is real and functional, but its own copy is hardcoded English, not routed through the language-mode/funny-level pipeline the rest of the app increasingly uses.

## Configuration

TODO(local-chat-sessions): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(local-chat-sessions): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(local-chat-sessions): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(local-chat-sessions): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(local-chat-sessions): link the related features, the prerequisites, and the natural next article a reader should open.

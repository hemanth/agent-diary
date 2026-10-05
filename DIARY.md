# Agent Diary · Τὰ εἰς ἑαυτόν (Engineering & Stoic Journal)

> Distilled learnings, technical challenges, root-cause solutions, user reflections, and Marcus Aurelius meditations across AI agent sessions.

## [2026-10-05] `audio-worklet`: Zero-copy ring buffers in the WebAudio render quantum
- **Session**: `demo-a10` · **Workspace**: `~/projects/audio-worklet` · **Virtue**: *Economy and Precision (Euteleia)*
- **Summary**: Replaced structured-clone postMessage calls on the 128-frame audio thread with a lock-free SharedArrayBuffer ring buffer and Atomics read/write pointers.

### I. The obstacle (Challenges)
- Allocating a new Float32Array inside process() triggered minor GC pauses every 40ms, causing audible clicks at 48kHz.
- Passing PCM chunks over MessagePort cloned the underlying ArrayBuffer instead of transferring ownership.

### II. The fix (Solutions)
- Pre-allocated a single SharedArrayBuffer ring buffer during processor initialization and updated read/write indices with Atomics.load and Atomics.store.
- Added Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy headers to enable SharedArrayBuffer in the local dev server.

### III. New learnings
- Never allocate objects or typed arrays inside a 128-frame WebAudio process() callback; a 2.66ms budget leaves no room for garbage collection.
- Use power-of-two ring buffer capacities so modulo wrapping reduces to a single bitwise AND (index & mask).

### IV. Ta Eis Heauton (Book IV, Section 24 · Apallage (Pruning the unnecessary))
> *"Ask yourself at every step: is this among the things that are necessary? Why copy the vessel when you can hand it across the threshold?"*

Most real-time jitter comes from work we asked the runtime to do on every tick. Allocate once at the boundary and let the hot loop only move pointers.

### V. User's note
*"Switching to a pre-allocated SharedArrayBuffer dropped worst-case callback time from 4.1ms to 0.08ms."*

---

## [2026-10-03] `sqlite-wal`: Preventing WAL starvation under continuous reader load
- **Session**: `demo-b20` · **Workspace**: `~/projects/sqlite-wal` · **Virtue**: *Temperance and Proportion (Sophrosyne)*
- **Summary**: Fixed unbounded .sqlite-wal file growth caused by leaked read transactions holding snapshot locks across async HTTP streams.

### I. The obstacle (Challenges)
- The write-ahead log grew past 4GB under steady traffic even though PRAGMA wal_autocheckpoint was set to 1000 pages.
- A single long-lived SSE connection kept an open read statement cursor, preventing SQLite from advancing the checkpoint mark.

### II. The fix (Solutions)
- Materialized query rows into memory before starting the SSE stream and finalized the prepared statement immediately in a finally block.
- Scheduled periodic PASSIVE checkpoints with a fallback to TRUNCATE during low-traffic windows.

### III. New learnings
- SQLite WAL checkpoints cannot overwrite pages needed by the oldest active read transaction; one unclosed cursor blocks reclamation for the entire database.
- Keep database transactions strictly shorter than network I/O streams.

### IV. Ta Eis Heauton (Book V, Section 23 · Panta Rhei (Nothing stands still))
> *"Time is a river of passing events, and strong is its current; no sooner is a thing brought to sight than it is swept by and another takes its place."*

A snapshot is meant to be read and released. When a reader clings to an old view of the world while new writes pour in, the ledger swells until the disk itself gives way.

### V. User's note
*"Closing the cursor before opening the SSE response stream kept the WAL file under 4MB all week."*

---

## [2026-09-29] `wasm-simd`: Fixing unaligned SIMD loads and NaN propagation in cosine similarity
- **Session**: `demo-c30` · **Workspace**: `~/projects/wasm-simd` · **Virtue**: *Truthfulness (Aletheia)*
- **Summary**: Tracked down silent NaN scores in the WebAssembly f32x4 dot-product kernel to unpadded tail vectors and zero-norm embeddings.

### I. The obstacle (Challenges)
- Queries with dimension counts not divisible by 4 read past the end of the embedding slice into adjacent heap bytes, producing sporadic NaN scores.
- Zero vectors divided 0.0 by 0.0 during L2 normalization and poisoned the top-k heap comparator.

### II. The fix (Solutions)
- Processed the main body in 4-wide f32x4 lanes and handled the remainingdimension % 4 elements in a scalar tail loop.
- Guarded the reciprocal square root with an epsilon check (normSq > 1e-12) before multiplying.

### III. New learnings
- A single NaN in a binary min-heap breaks the total ordering invariant because both NaN < x and NaN > x evaluate to false.
- Always test SIMD kernels with prime-length inputs (e.g. 381 or 1539 elements) to exercise the scalar remainder path.

### IV. Ta Eis Heauton (Book III, Section 11 · Hypolepsis (Testing impressions))
> *"Examine the thing itself in its own nature, bare and separate from all that borders it, and tell yourself its proper name."*

Four lanes march together cleanly until the road narrows at the boundary. If you read four floats where only three were written, the fourth is a stranger that corrupts the whole sum.

### V. User's note
*"Adding a property test with prime vector lengths caught the tail-read bug in 12ms."*

---

## [2026-09-24] `raft-kv`: Split-vote livelock and fsync ordering before RequestVote replies
- **Session**: `demo-d40` · **Workspace**: `~/projects/raft-kv` · **Virtue**: *Courage and Exactness (Andreia)*
- **Summary**: Resolved a 3-node election livelock under symmetric network delay and moved term/votedFor disk persistence ahead of RPC response transmission.

### I. The obstacle (Challenges)
- All three nodes initialized their pseudo-random election timers from the same millisecond timestamp in container tests, causing repeated split votes.
- Nodes sent RequestVote responses before flushing votedFor to disk, allowing a crashed-and-restarted node to vote twice in the same term.

### II. The fix (Solutions)
- Seeded each node's jitter generator from OS entropy and widened the election timeout window to 150ms-300ms.
- Enforced fdatasync on the metadata log before enqueueing outbound RequestVote or AppendEntries packets.

### III. New learnings
- In Raft, persisting currentTerm and votedFor before replying is a safety invariant, not an optimization; skipping fsync allows two leaders in one term.
- Deterministic simulation tests should inject distinct per-node seeds so timers do not lockstep.

### IV. Ta Eis Heauton (Book VII, Section 55 · Katalepsis (Firm grasp of state))
> *"Do not give your assent before the record is fixed in stone; a promise spoken to the wind and forgotten on waking divides the city against itself."*

A node that forgets whom it voted for after a reboot betrays the quorum. Write the vow to durable storage before you send the messenger out the gate.

### V. User's note
*"Running 1,000 simulated crash-recovery cycles with randomized packet drops passed with zero double-votes."*

---

## [2026-09-18] `shader-pipeline`: WGSL uniform struct alignment and 16-byte vec3f padding traps
- **Session**: `demo-e50` · **Workspace**: `~/projects/shader-pipeline` · **Virtue**: *Practical Wisdom (Phronesis)*
- **Summary**: Fixed garbled camera matrices in the WebGPU compute pass caused by a 12-byte vec3f field shifting the following float in the host Float32Array.

### I. The obstacle (Challenges)
- In WGSL uniform address space, vec3<f32> has a size of 12 bytes but an alignment of 16 bytes, which shifted every subsequent struct member by 4 bytes when packed from JS.
- The pipeline compiled without warnings while reading the wrong byte offsets for projection matrix columns.

### II. The fix (Solutions)
- Paired each vec3<f32> field with an explicit scalar f32 parameter (cameraPos: vec3f, exposure: f32) so host and device layouts match at 16-byte boundaries.
- Added a startup assertion comparing the byte length of the staging ArrayBuffer against the WGSL struct stride.

### III. New learnings
- Never assume C-style tight packing for vec3 fields in WebGPU uniform buffers; always pad to 16-byte vec4 boundaries explicitly.
- Verify GPU buffer layouts with a known sentinel value in the last field of the uniform struct.

### IV. Ta Eis Heauton (Book VI, Section 13 · Metron (Measure and alignment))
> *"When the mason lays three stones where the arch demands four, the gap does not vanish; it pulls every course above it out of plumb."*

Hardware reads by its own stride, not by our wishful counting. Respect the 16-byte boundary in the struct definition so no hidden gap shifts the frame.

### V. User's note
*"Explicitly pairing vec3f with a scalar f32 in every uniform struct made the CPU-to-GPU layout self-documenting."*

---

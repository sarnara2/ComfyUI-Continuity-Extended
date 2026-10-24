"""How H3 reads a request. See `families/grammar.py` for what the four answers
are and why they are the family's rather than the compiler's.

All four of these were in `compile.py`, unqualified, because there was one
family when they were written. They are H3's:

- **Nine images, three clips, three sounds, twelve files.** The model card's
  numbers, and the shape of the packed sequence behind them.
- **Five mode names.** They are H3's own — `REF2VA` is a form of its training
  and `encode.py` and `payload.py` both branch on the name.
- **A reference means the Ref2VA weights.** The pair is one architecture trained
  twice, so this is a real routing rule and not a naming one; `compile.py`
  still honours a pin against it, which is the thing the *user* may know that
  this cannot.
- **Context-IR.** H3-Base was trained on H3-Context-IR's structured output.
  This editor retains its field ordering, reference bindings and real cut
  times without automatically inserting Shot labels. User-written Shot
  labels remain prose. Independently owned rules are composed once with
  their paragraph boundaries and applicability preserved.
"""

from ... import canvas
from .. import grammar
from . import contextir, declare, subjects


class H3Grammar(grammar.Grammar):
    """H3's request grammar. See the module docstring."""

    # The parts of H3's Context-IR reference form, which are what a rewrite may
    # carry back and what `contextir.compose` composes.
    written_sections = contextir.REF_SECTIONS

    modes = {"reference": "REF2VA",
             "opens_closes": "FL2VA",
             "opens": "I2VA",
             "closes": "L2VA",
             "text": "T2VA"}

    max_images = 9
    max_videos = 3
    max_audios = 3
    max_files = 12

    takes_screens = True

    # References are encoded *for* Ref2VA, so any citation routes there; every
    # other shape lands on FL2VA. Mirrors the manifest's `routes` block, which
    # is what the frontend draws the badge from.
    routes = {"REF2VA": "ref2va"}
    default_route = "fl2va"

    def join_shots(self, shots):
        """The shots as a Context-IR shot list, cuts marked. See `contextir`."""
        return contextir.shot_body(shots)

    def sections(self, *, cast, labels, subject_labels, plan, body, shots,
                 framed, speaker_ids=None, **rest):
        """`subject_definitions`, `retention_analysis` and `summary`.

        All three are derived for a reference generation whether or not there is
        a cast, because the alternative is what the direct path used to emit: a
        sentence with `<Picture 1>` substituted into it and nothing anywhere
        saying what `<Picture 1>` is. Section 2 of the guide is the whole
        rebuttal — a label the prompt never defines is a label pointing at
        nothing — and section 4.1 asks for one retention line per label, which
        is what `retention_lines` writes for the files no subject claimed.

        A claimed asset's `<Picture N>` is cited *inside* the subject that
        claims it and gets no definition line of its own; §2.2 is explicit that
        an image used only to define a character must not get a standalone
        entry.
        """
        claimed = subjects.claimed(cast)
        annotations = rest.get("reference_annotations") or ()
        owners = {handle: subject_labels[subject.handle]
                  for subject in cast for handle in subject.files}
        descriptions = contextir.annotation_lines(annotations, labels, "description", owners)
        usage = contextir.annotation_lines(annotations, labels, "usage_rules")
        # Which clip's occupant each cast member stands in for. The clip is not
        # among the subject's own files — its content is kept, so it holds its
        # `<Video N>` line — and that line is where the swap has to be scoped,
        # or the generic edit line claims the occupant stays.
        replaced = {}
        identification_handles = set()
        assets = {step["asset"].handle: step["asset"] for step in (plan or ())}
        for subject in cast:
            for handle in subject.replaces:
                asset = assets.get(handle)
                identification = bool(asset and (asset.kind == "image" or
                    (subject.replacement_reference_only and asset.takes != "edit")))
                if identification:
                    identification_handles.add(handle)
                replaced.setdefault(handle, []).append(
                    (subject_labels[subject.handle], subject.replaces_what, identification,
                     (rest.get("subject_scopes") or {}).get(subject.handle),
                     (rest.get("target_scopes") or {}).get(subject.handle)))
        derived = {}
        if cast:
            derived["subject_definitions"] = subjects.definitions(
                cast, labels,
                contextir.reference_lines(plan, skip=claimed,
                                          replaced=replaced, annotations=annotations) + descriptions
                if plan else descriptions,
                # The compiler allocated these off the prose before it
                # substituted them away — see `subjects.speakers`. The voice
                # line here and the `(Sx)` in the body have to be the same
                # number, and by now the body no longer says which.
                ids=speaker_ids, reference_annotations=annotations)
            derived["retention_analysis"] = "\n\n".join(
                [subjects.retention(cast, labels, body, identification_handles,
                                    rest.get("subject_scopes"),
                                    explicit_rules=rest.get("explicit_rules"),
                                    target_scopes=rest.get("target_scopes"),
                                    reference_annotations=annotations)]
                + contextir.retention_lines(plan, skip=claimed, body=body,
                                            replaced=replaced,
                                            scopes=rest.get("reference_scopes"),
                                            target_scopes=rest.get("target_scopes"),
                                            annotations=annotations) + usage).strip()
        elif plan:
            derived["subject_definitions"] = "\n\n".join(
                contextir.reference_lines(plan, annotations=annotations) + descriptions)
            derived["retention_analysis"] = "\n\n".join(
                contextir.retention_lines(plan, body=body,
                                         scopes=rest.get("reference_scopes"),
                                         target_scopes=rest.get("target_scopes"),
                                         annotations=annotations) + usage)
        if derived:
            derived["summary"] = contextir.summary(
                plan, cast, subject_labels, labels,
                shots=max(int(shots or 1), contextir.count_shots(body)),
                has_frames=framed, target_scopes=rest.get("target_scopes"))
        bindings = {**labels, **subject_labels}
        return {name: subjects.bound_text(text, bindings) for name, text in derived.items()}

    def count_shots(self, body, cards):
        """Counted off the text: `[Shot N]` markers are in it, and a card may
        write several of its own inside the one the timeline allotted it."""
        return contextir.count_shots(body)

    def compose(self, *, mode, encode_mode, body, soundscape, music, seconds,
                labels, first_frame, last_frame, audio_seam, shots, sections,
                **rest):
        """The Context-IR skeleton, with the prose in it.

        `mode` is the mode as far as the *prompt* is concerned, which is not
        always `encode_mode` — the one that decides the checkpoint and the
        encode path. `compile.py` works the distinction out, because a blended
        seam whose frame is not pinned sends no picture for the alignment line
        to name.

        `shots` is the larger of what the caller counted and what the body
        numbers itself: a card may write several shots inside the one the
        timeline allotted it, and the last of those is the one holding the end
        frame.
        """
        return contextir.compose(
            mode, body, soundscape, music, seconds,
            preamble=self._preamble(encode_mode, labels, first_frame,
                                    last_frame, seconds, shots, audio_seam),
            shots=max(int(shots or 1), contextir.count_shots(body)),
            sections=sections,
            audio_reuse=bool(any(row.get("usage_rules") for row in
                                rest.get("reference_annotations") or ())
                             and "audio reuse" in contextir.task_types(rest.get("plan") or (),
                                 edited={handle for subject in rest.get("cast") or ()
                                         if not subject.replacement_reference_only
                                         for handle in subject.replaces})))

    def _preamble(self, encode_mode, labels, first_frame, last_frame, seconds,
                  shots, audio_seam):
        """The line in front of the body, or nothing.

        On a reference generation it is the alignment line naming which ordinals
        the start and end frames took — they are presented after the references,
        so their `<Picture N>`s are not the first two and the prompt has to say
        which they are.

        Otherwise it is the seam sentence, and only where the inherited tail is
        presented to the tokenizer as `<Audio 1>`: the prompt has to say what
        that label is or it points at nothing. Not on a reference segment, whose
        own references own the audio numbering, and not on a feathered seam,
        which pins the tail on this segment's own timeline — in both the tail
        rides unlabelled and the line would name something absent.
        """
        if encode_mode == self.modes["reference"]:
            return contextir.ref_frame_alignment(
                labels.get(first_frame.handle) if first_frame else None,
                labels.get(last_frame.handle) if last_frame else None,
                seconds, shots)
        return contextir.AUDIO_SEAM_LINE if audio_seam else ""


GRAMMAR = H3Grammar()

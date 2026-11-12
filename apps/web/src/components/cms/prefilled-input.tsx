import { useEffect, useRef } from "react";
import { PatchEvent, set, type ArrayOfObjectsInputProps, type FormPatch, type StringInputProps } from "sanity";

// A field's repository copy becomes its editable value the first time the
// field is shown empty, so an editor changes the words instead of retyping
// them. Sanity's `initialValue` only runs when a document is created, so a
// section added later (or a field never saved) would otherwise open blank.
// Clearing a field stores "" rather than removing it: a removed value means
// "never edited", which the website fills with the repository copy again.
export function prefilledInput(defaultValue: string) {
  return function PrefilledInput(props: StringInputProps) {
    const { value, readOnly, onChange } = props;
    const prefilled = useRef(false);
    useEffect(() => {
      if (value === undefined && !readOnly && !prefilled.current) {
        prefilled.current = true;
        onChange(set(defaultValue));
      }
    }, [value, readOnly, onChange]);
    return props.renderDefault({
      ...props,
      onChange: (change: FormPatch | FormPatch[] | PatchEvent) => {
        prefilled.current = true;
        const patches = PatchEvent.from(change).patches.map((patch) => patch.type === "unset" && patch.path.length === 0 ? set("") : patch);
        onChange(PatchEvent.from(patches));
      },
    });
  };
}

// The same for a list of page sections: opens with the page's current content
// so sections can be edited, reordered, added and removed. Once emptied, the
// list stays empty.
export function prefilledSections(defaultValue: unknown[]) {
  return function PrefilledSections(props: ArrayOfObjectsInputProps) {
    const { value, readOnly, onChange } = props;
    const prefilled = useRef(false);
    useEffect(() => {
      if (value === undefined && !readOnly && !prefilled.current) {
        prefilled.current = true;
        onChange(set(defaultValue));
      }
    }, [value, readOnly, onChange]);
    return props.renderDefault({
      ...props,
      onChange: (change: FormPatch | FormPatch[] | PatchEvent) => {
        prefilled.current = true;
        const patches = PatchEvent.from(change).patches.map((patch) => patch.type === "unset" && patch.path.length === 0 ? set([]) : patch);
        onChange(PatchEvent.from(patches));
      },
    });
  };
}


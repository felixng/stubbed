import { useEffect } from "react";
import { set, type StringInputProps } from "sanity";

// A field's repository copy becomes its editable value the first time the
// field is shown empty, so an editor changes the words instead of retyping
// them. Sanity's `initialValue` only runs when a document is created, so a
// section added later (or a field never saved) would otherwise open blank.
// A field the editor cleared is "" rather than undefined, and stays cleared.
export function prefilledInput(defaultValue: string) {
  return function PrefilledInput(props: StringInputProps) {
    const { value, readOnly, onChange } = props;
    useEffect(() => {
      if (value === undefined && !readOnly) onChange(set(defaultValue));
    }, [value, readOnly, onChange]);
    return props.renderDefault(props);
  };
}

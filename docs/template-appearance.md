# Template appearance modes

Bee-Core templates expose two appearance modes: `light` and `dark`. A template owns its visual identity and palette; users do not edit arbitrary colors.

## Supported templates

| Surface | Template | Default mode |
|---|---|---|
| Public landing | Aurora | Dark |
| Public landing | Editorial | Light |
| Public landing package | Studio | Light |
| Dashboard | Midnight | Dark |
| Dashboard | Paper | Light |
| Dashboard package | Glass | Dark |

Both modes can be selected for every template, regardless of its default.

## Controls

- The public landing header provides a mode toggle for the active public template.
- The dashboard header provides a mode toggle for the active dashboard template.
- Settings > Appearance exposes the same mode controls alongside the template manager.
- Switching templates restores that template's own saved mode.

## Preference scope

Preferences are currently browser-local:
- Public mode is stored per hostname, so the corporate landing and each tenant hostname can differ.
- Dashboard mode is stored per active company, so companies in the same browser can differ.
- The selected template is part of the storage key, so each template retains its own Light/Dark choice.

Backend synchronization across browsers/devices is a follow-up task. This does not change the server-side template installation or selection model.

## Design rule

Template packages define their own fixed palette and must support both modes. The mode switch changes semantic surfaces, text, borders and contrast without exposing arbitrary color controls. Plugin components should use the active template's semantic CSS tokens and inherit the current mode.

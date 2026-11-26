import { Component } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";

@Component({ selector: "bee-connected-devices-remote-root", standalone: true, template: "" })
class RemoteBuildRootComponent {}

bootstrapApplication(RemoteBuildRootComponent).catch(error => console.error(error));

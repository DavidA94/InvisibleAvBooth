export interface TemplatePayload {
  id: string;
  name: string;
  category: "title" | "description";
  formatString: string;
  roleMinimum: string;
}

export function titleTemplateDefault(): TemplatePayload {
  return { id: "t1", name: "Default", category: "title", formatString: "{Date} – {Speaker} – {Title}", roleMinimum: "AvVolunteer" };
}

export function descriptionTemplateNone(): TemplatePayload {
  return { id: "t2", name: "None", category: "description", formatString: "", roleMinimum: "AvVolunteer" };
}

export function templateList(): TemplatePayload[] {
  return [titleTemplateDefault(), descriptionTemplateNone()];
}

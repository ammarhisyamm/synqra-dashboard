import test from 'node:test';
import assert from 'node:assert/strict';
import { MEETING_TEMPLATES, filterMeetingTemplates, meetingTemplate, templateNotes, meetingEvidence } from '../src/lib/meeting-templates.js';
import { documentPatch } from '../worker/documents.js';

test('meeting agendas are unique, previewable and never treated as evidence', () => {
  assert.equal(new Set(MEETING_TEMPLATES.map(item => item.id)).size,MEETING_TEMPLATES.length);
  assert.equal(MEETING_TEMPLATES.length,18);
  for (const template of MEETING_TEMPLATES) {
    assert.ok(template.name && template.division && template.description);
    assert.ok(templateNotes(template).length < 5000);
    assert.equal(meetingEvidence(templateNotes(template)),'');
  }
  assert.equal(templateNotes(meetingTemplate('blank')),'');
  assert.ok(filterMeetingTemplates('interview','People / HR').some(item => item.id === 'candidate-interview'));
  assert.equal(filterMeetingTemplates('does-not-exist').length,0);
  assert.equal(meetingEvidence('## Action items\n> Owner — action — due date\nAction: Jane to verify the fix\n'), 'Action: Jane to verify the fix');
});
test('document validation rejects invalid types, oversized input and malformed fields', () => {
  assert.deepEqual(documentPatch({title:'  Plan  '},true),{title:'Plan',type:'general',content:'',epic_id:null,sprint_id:null});
  for (const input of [{title:''},{title:'x'.repeat(201)},{title:'Plan',type:'html'},{title:'Plan',content:'x'.repeat(20001)},{title:'Plan',epicId:5},{title:'Plan',archived:'true'}]) assert.throws(() => documentPatch(input,true));
  assert.deepEqual(documentPatch({archived:false}),{archived:0});
});

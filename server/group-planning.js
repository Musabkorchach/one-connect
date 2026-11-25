import { ObjectId } from "mongodb";

const maxEntries = 20;
const text = (value, length) => typeof value === "string" && value.trim().length <= length ? value.trim() : "";
const error = (status, message) => ({ status, message });
const update = (key, entries) => ({ changes: { [key]: entries } });

export function groupTopics(group) {
  return (group.topics ?? []).map(({ id, title, closed }) => ({ id, title, closed }));
}

export function groupPlanningView(group, username) {
  return {
    topics: groupTopics(group),
    polls: (group.polls ?? []).map(({ votes, ...poll }) => ({
      ...poll, choice: votes.find(vote => vote.username === username)?.choice ?? null,
      totals: poll.options.map((_option, index) => votes.filter(vote => vote.choice === index).length),
    })),
    events: (group.events ?? []).map(({ responses, ...event }) => ({
      ...event, attending: responses.includes(username), attendees: responses.length,
    })),
  };
}

export function groupPlanningChange(group, username, manage, data) {
  const [section, operation] = data.action.split(":");
  const locations = { topic: "topics", poll: "polls", event: "events" };
  const key = locations[section];
  if (!key || !["create", "close", "vote", "rsvp"].includes(operation)) return error(400, "Unknown planning action");
  if ((operation === "create" || operation === "close") && !manage) {
    return error(403, "Group management permission required");
  }

  const entries = group[key] ?? [];
  if (operation === "create") {
    const title = text(data.title, 100);
    if (!title) return error(400, "Invalid title");
    if (entries.length >= maxEntries) return error(409, "Group planning limit reached");
    const entry = { id: new ObjectId().toHexString(), title, closed: false };
    if (section === "poll") {
      const options = Array.isArray(data.options) && data.options.length >= 2 && data.options.length <= 6
        ? data.options.map(option => text(option, 80)) : [];
      if (!options.length || options.includes("") || new Set(options).size !== options.length) {
        return error(400, "Provide two to six distinct poll options");
      }
      Object.assign(entry, { options, votes: [] });
    }
    if (section === "event") {
      if (!Number.isSafeInteger(data.startsAt) || data.startsAt <= Date.now() || data.startsAt > 8640000000000000) {
        return error(400, "Invalid event time");
      }
      Object.assign(entry, { startsAt: data.startsAt, responses: [] });
    }
    return update(key, [...entries, entry]);
  }

  const index = entries.findIndex(entry => entry.id === data.id);
  if (index < 0) return error(404, "Group planning item is unavailable");
  const entry = entries[index];
  if (entry.closed) return error(409, "Group planning item is closed");
  const next = { ...entry };
  if (operation === "close") next.closed = true;
  else if (operation === "vote" && section === "poll") {
    if (data.choice !== null && (!Number.isInteger(data.choice) || data.choice < 0 || data.choice >= entry.options.length)) {
      return error(400, "Invalid poll choice");
    }
    next.votes = entry.votes.filter(vote => vote.username !== username && group.members.includes(vote.username));
    if (data.choice !== null) next.votes.push({ username, choice: data.choice });
  } else if (operation === "rsvp" && section === "event") {
    if (typeof data.attending !== "boolean" || entry.startsAt <= Date.now()) return error(409, "Event registration is closed");
    next.responses = entry.responses.filter(person => person !== username && group.members.includes(person));
    if (data.attending) next.responses.push(username);
  } else return error(400, "Unknown planning action");

  return update(key, entries.map((value, location) => location === index ? next : value));
}

export function removePlanningParticipant(group, username) {
  return {
    ...(group.polls && { polls: group.polls.map(poll => ({ ...poll, votes: poll.votes.filter(vote => vote.username !== username) })) }),
    ...(group.events && { events: group.events.map(event => ({ ...event, responses: event.responses.filter(person => person !== username) })) }),
  };
}

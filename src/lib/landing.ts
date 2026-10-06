"use strict";

/**
 * Landing-page content model, shared by three places that must always agree:
 *
 *   · the PATCH API that stores it      (app/api/school-settings/landing)
 *   · the admin editor                  (app/dashboard/landing)
 *   · the public page that renders it   (app/page.tsx)
 *
 * Keeping the shape and the normaliser here means a partially filled document
 * (an empty array, a missing photo, a legacy row) can never break the public
 * page — every read is folded into a complete, typed LandingContent.
 *
 * Nothing in this file imports mongoose, so it is safe in client components.
 */

/** One achiever in the "Top students" band. */
export type TopStudent = {
  id: string;
  name: string;
  className: string;
  section: string;
  achievement: string;
  year: string;
  photo: string;
  photoPublicId: string;
};

/** One news / announcement card. */
export type NewsPost = {
  id: string;
  title: string;
  description: string;
  image: string;
  imagePublicId: string;
  published: boolean;
  publishedAt: string;
};

/** One picture in the campus gallery. */
export type GalleryImage = {
  id: string;
  image: string;
  imagePublicId: string;
  caption: string;
};

/** Everything the public landing page may show beyond the base school fields. */
export type LandingContent = {
  tagline: string;
  mission: string;
  vision: string;
  principalName: string;
  principalMessage: string;
  principalPhoto: string;
  principalPhotoPublicId: string;
  coverImage: string;
  coverImagePublicId: string;
  logo: string;
  logoPublicId: string;
  topStudents: TopStudent[];
  newsPosts: NewsPost[];
  gallery: GalleryImage[];
};

/** A blank landing, used before setup or when a field was never filled in. */
export const EMPTY_LANDING: LandingContent = {
  tagline: "",
  mission: "",
  vision: "",
  principalName: "",
  principalMessage: "",
  principalPhoto: "",
  principalPhotoPublicId: "",
  coverImage: "",
  coverImagePublicId: "",
  logo: "",
  logoPublicId: "",
  topStudents: [],
  newsPosts: [],
  gallery: [],
};

/** Coerces anything into a trimmed string. */
function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Reads an ObjectId-ish value (or a saved subdocument id) as a string. */
function id(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "_id" in value) return String((value as { _id: unknown })._id);
  return "";
}

/** Normalises a date-ish value to an ISO string (or "" when absent). */
function isoDate(value: unknown): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

/**
 * Folds a raw school document (lean or not) into a complete LandingContent.
 * Every list entry without a usable photo AND without any text is dropped, so
 * an empty "Add" row never shows up on the public page.
 */
export function readLanding(raw: unknown): LandingContent {
  const source = (raw ?? {}) as Record<string, unknown>;
  const list = (value: unknown) => (Array.isArray(value) ? value : []);

  const topStudents: TopStudent[] = list(source.topStudents).map((entry) => {
    const item = (entry ?? {}) as Record<string, unknown>;
    return {
      id: id(item._id ?? item.id),
      name: text(item.name),
      className: text(item.className),
      section: text(item.section),
      achievement: text(item.achievement),
      year: text(item.year),
      photo: text(item.photo),
      photoPublicId: text(item.photoPublicId),
    };
  });

  const newsPosts: NewsPost[] = list(source.newsPosts).map((entry) => {
    const item = (entry ?? {}) as Record<string, unknown>;
    return {
      id: id(item._id ?? item.id),
      title: text(item.title),
      description: text(item.description),
      image: text(item.image),
      imagePublicId: text(item.imagePublicId),
      published: item.published === undefined ? true : Boolean(item.published),
      publishedAt: isoDate(item.publishedAt),
    };
  });

  const gallery: GalleryImage[] = list(source.gallery).map((entry) => {
    const item = (entry ?? {}) as Record<string, unknown>;
    return {
      id: id(item._id ?? item.id),
      image: text(item.image),
      imagePublicId: text(item.imagePublicId),
      caption: text(item.caption),
    };
  });

  return {
    tagline: text(source.tagline),
    mission: text(source.mission),
    vision: text(source.vision),
    principalName: text(source.principalName),
    principalMessage: text(source.principalMessage),
    principalPhoto: text(source.principalPhoto),
    principalPhotoPublicId: text(source.principalPhotoPublicId),
    coverImage: text(source.coverImage),
    coverImagePublicId: text(source.coverImagePublicId),
    logo: text(source.logo),
    logoPublicId: text(source.logoPublicId),
    topStudents,
    newsPosts,
    gallery,
  };
}

/** Only the news posts the admin marked as published, newest first. */
export function publishedNews(content: LandingContent): NewsPost[] {
  return content.newsPosts
    .filter((post) => post.published && (post.title || post.description || post.image))
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
}

/** Top students that carry at least a name, for the achiever band. */
export function visibleTopStudents(content: LandingContent): TopStudent[] {
  return content.topStudents.filter((student) => student.name);
}

/** Gallery pictures that actually carry an image. */
export function visibleGallery(content: LandingContent): GalleryImage[] {
  return content.gallery.filter((item) => item.image);
}
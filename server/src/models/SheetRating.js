import mongoose from 'mongoose';

const { Schema, model } = mongoose;

// How good a list is, 1-5 stars, set by the team on the Import page. Keyed by the list name contacts
// carry as source.sheetName (so uploaded files are rated like linked Google Sheets); renaming a list
// moves its rating along (services/lists.js).
const SheetRatingSchema = new Schema(
  {
    name: { type: String, required: true, unique: true },
    stars: { type: Number, min: 1, max: 5, required: true },
    ratedBy: { type: String, default: '' },
  },
  { timestamps: true },
);

export const SheetRating = model('SheetRating', SheetRatingSchema);

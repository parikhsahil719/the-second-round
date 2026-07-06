"""Shared tier constants for the model layer."""

TIERS = ["OOL", "FRINGE", "ROTATION", "STARTER", "ALL_STAR", "ELITE"]
TIERS5 = ["OOL", "FRINGE", "ROTATION", "STARTER", "STAR"]  # AS+ELITE merged

# surplus-value-shaped utilities (convex: stars are worth far more than a linear step)
UTILITY = {"OOL": 0.0, "FRINGE": 1.0, "ROTATION": 3.0, "STARTER": 8.0,
           "ALL_STAR": 20.0, "ELITE": 40.0}


def value_grade(shortfall: float) -> str:
    """Market-relative outcome grade: realized utility minus slot-implied EV.

    Two-axis framework (DECISIONS.md D14): the tier says what a player became;
    this grade says what the pick cost. Self-adjusting by slot — a 55th pick who
    never plays 'Delivered' (nothing was promised), a #1 who becomes a starter
    merely 'Underdelivered' (Wiggins), and 'Bust' is reserved for Bennett-grade
    shortfalls."""
    if shortfall < -7:
        return "Bust"
    if shortfall < -3:
        return "Underdelivered"
    if shortfall <= 3:
        return "Delivered"
    return "Outperformed"

FEATURES = [
    "age_at_draft", "height_in", "class_ord", "rec_score", "rec_missing", "power_conf",
    "min_pct", "usg", "ts", "efg", "ortg", "adjoe", "porpag", "adrtg", "dporpag",
    "bpm_c", "obpm_c", "dbpm_c",
    "ft_pct_shr", "two_pct_shr", "three_pct_shr", "rim_pct_shr", "mid_pct_shr",
    "fta_pg", "three_a_pg", "ftr", "three_rate", "rim_share", "dunk_share",
    "ast_pct", "tov_pct", "ast_tov", "orb_pct", "drb_pct", "stl_pct", "blk_pct",
    "mp_total", "gp", "n_seasons", "career_bpm", "d_bpm", "d_usg", "d_ts", "d_min_pct",
    "wingspan", "wingspan_minus_height", "standing_reach", "max_vertical_leap",
    "lane_agility_time", "three_quarter_sprint", "combine_missing",
    "pos_G", "pos_W", "pos_B", "blk_x_big", "ast_x_guard",
]

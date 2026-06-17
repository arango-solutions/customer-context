"""
Pydantic prose schemas for LLM-generated document content.

D-02 fence: every model contains ONLY prose string fields.
No numeric, date, or UUID fields are allowed.

Field validators reject:
- Dollar amounts (pattern: dollar sign followed by digits)
- Independently-introduced dates (YYYY-MM-DD or Month DD, YYYY)
- API key patterns (sk- prefix with alphanumeric suffix)

The Jinja2 system prompt may inject event_date as read-only context;
that date never appears in the prose output schema (LLM must not echo it
back as a field value).
"""

import re
from typing import List

from pydantic import BaseModel, model_validator


# ---------------------------------------------------------------------------
# Shared validator logic
# ---------------------------------------------------------------------------

# CR-08: expanded to also reject abbreviated amounts the LLM commonly emits:
# $1M, $500K, $1.5M, $120k, $2.3B, $45.6k, etc.
# Pattern: $ followed by one or more digits (with optional decimal) then optional K/M/B suffix,
# OR $ followed by digits/commas (original numeric pattern).
_DOLLAR_PATTERN = re.compile(r"\$[\d,]+|\$\d+(?:\.\d+)?[KkMmBb]\b")
_DATE_PATTERN = re.compile(r"\d{4}-\d{2}-\d{2}")
_MONTH_DATE_PATTERN = re.compile(
    r"\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b",
    re.IGNORECASE,
)
_API_KEY_PATTERN = re.compile(r"sk-[A-Za-z0-9]{40}")


def _check_no_facts(value: str, field_name: str) -> None:
    """
    Raise ValueError if the string value contains a dollar amount, an
    independently-introduced date, or an API key pattern.
    """
    if _DOLLAR_PATTERN.search(value):
        raise ValueError(
            f"Field '{field_name}' contains a dollar amount (D-02 violation): {value!r}"
        )
    if _DATE_PATTERN.search(value):
        raise ValueError(
            f"Field '{field_name}' contains an independently-introduced date "
            f"(D-02 violation): {value!r}"
        )
    if _MONTH_DATE_PATTERN.search(value):
        raise ValueError(
            f"Field '{field_name}' contains a month-name date (D-02 violation): {value!r}"
        )
    if _API_KEY_PATTERN.search(value):
        raise ValueError(
            f"Field '{field_name}' contains an API key pattern (T-02-04-02 violation): {value!r}"
        )


def _validate_all_string_fields(model_instance: BaseModel) -> None:
    """Iterate all string fields on a model and apply _check_no_facts."""
    for field_name, field_value in model_instance.__dict__.items():
        if isinstance(field_value, str):
            _check_no_facts(field_value, field_name)
        elif isinstance(field_value, list):
            for i, item in enumerate(field_value):
                if isinstance(item, str):
                    _check_no_facts(item, f"{field_name}[{i}]")


# ---------------------------------------------------------------------------
# Prose models
# ---------------------------------------------------------------------------


class SlackMessageProse(BaseModel):
    """
    Prose fields for a Slack thread entry.

    LLM fills ONLY these fields. No facts (dates, amounts, IDs) allowed.
    """

    opening_line: str
    body_paragraph: str
    closing_line: str

    @model_validator(mode="after")
    def no_facts_in_prose(self) -> "SlackMessageProse":
        _validate_all_string_fields(self)
        return self


class EmailProse(BaseModel):
    """
    Prose fields for an email document.

    body_paragraphs: 2–4 paragraphs of email body text.
    """

    subject: str
    greeting: str
    body_paragraphs: List[str]
    closing: str

    @model_validator(mode="after")
    def no_facts_in_prose(self) -> "EmailProse":
        _validate_all_string_fields(self)
        if len(self.body_paragraphs) < 2:
            raise ValueError("body_paragraphs must have at least 2 items")
        if len(self.body_paragraphs) > 4:
            raise ValueError("body_paragraphs must have at most 4 items")
        return self


class DocsProse(BaseModel):
    """
    Prose fields for a Google Docs / Markdown document.

    body_sections: 2–5 markdown sections (paragraphs).
    action_items: 0–5 bullet-point action items.
    """

    title: str
    executive_summary: str
    body_sections: List[str]
    action_items: List[str]

    @model_validator(mode="after")
    def no_facts_in_prose(self) -> "DocsProse":
        _validate_all_string_fields(self)
        if len(self.body_sections) < 2:
            raise ValueError("body_sections must have at least 2 items")
        if len(self.body_sections) > 5:
            raise ValueError("body_sections must have at most 5 items")
        if len(self.action_items) > 5:
            raise ValueError("action_items must have at most 5 items")
        return self


class NpsVerbatimProse(BaseModel):
    """
    Prose field for an NPS survey verbatim comment.

    verbatim_text: 50–200 characters.
    """

    verbatim_text: str

    @model_validator(mode="after")
    def no_facts_in_prose(self) -> "NpsVerbatimProse":
        _validate_all_string_fields(self)
        if len(self.verbatim_text) < 50:
            raise ValueError(
                f"verbatim_text too short ({len(self.verbatim_text)} chars, min 50)"
            )
        if len(self.verbatim_text) > 200:
            raise ValueError(
                f"verbatim_text too long ({len(self.verbatim_text)} chars, max 200)"
            )
        return self


class PdfSectionProse(BaseModel):
    """
    Prose fields for a PDF section (EBR deck, ROI report, contract summary).

    key_findings: 2–5 bullet points.
    """

    headline: str
    narrative_paragraph: str
    key_findings: List[str]

    @model_validator(mode="after")
    def no_facts_in_prose(self) -> "PdfSectionProse":
        _validate_all_string_fields(self)
        if len(self.key_findings) < 2:
            raise ValueError("key_findings must have at least 2 items")
        if len(self.key_findings) > 5:
            raise ValueError("key_findings must have at most 5 items")
        return self

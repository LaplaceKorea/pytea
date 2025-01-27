import os
from _typeshed import BytesPath, StrOrBytesPath, StrPath, SupportsRichComparisonT
from typing import Sequence, Tuple, overload
from typing_extensions import Literal

# All overloads can return empty string. Ideally, Literal[""] would be a valid
# Iterable[T], so that list[T] | Literal[""] could be used as a return
# type. But because this only works when T is str, we need Sequence[T] instead.
@overload
def commonprefix(m: Sequence[StrPath]) -> str: ...
@overload
def commonprefix(m: Sequence[BytesPath]) -> bytes | Literal[""]: ...
@overload
def commonprefix(m: Sequence[list[SupportsRichComparisonT]]) -> Sequence[SupportsRichComparisonT]: ...
@overload
def commonprefix(m: Sequence[Tuple[SupportsRichComparisonT, ...]]) -> Sequence[SupportsRichComparisonT]: ...
def exists(path: StrOrBytesPath | int) -> bool: ...
def getsize(filename: StrOrBytesPath | int) -> int: ...
def isfile(path: StrOrBytesPath | int) -> bool: ...
def isdir(s: StrOrBytesPath | int) -> bool: ...

# These return float if os.stat_float_times() == True,
# but int is a subclass of float.
def getatime(filename: StrOrBytesPath | int) -> float: ...
def getmtime(filename: StrOrBytesPath | int) -> float: ...
def getctime(filename: StrOrBytesPath | int) -> float: ...
def samefile(f1: StrOrBytesPath | int, f2: StrOrBytesPath | int) -> bool: ...
def sameopenfile(fp1: int, fp2: int) -> bool: ...
def samestat(s1: os.stat_result, s2: os.stat_result) -> bool: ...

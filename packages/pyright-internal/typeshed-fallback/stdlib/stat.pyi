import sys
from typing_extensions import Literal

def S_ISDIR(mode: int) -> bool: ...
def S_ISCHR(mode: int) -> bool: ...
def S_ISBLK(mode: int) -> bool: ...
def S_ISREG(mode: int) -> bool: ...
def S_ISFIFO(mode: int) -> bool: ...
def S_ISLNK(mode: int) -> bool: ...
def S_ISSOCK(mode: int) -> bool: ...
def S_IMODE(mode: int) -> int: ...
def S_IFMT(mode: int) -> int: ...
def S_ISDOOR(mode: int) -> int: ...
def S_ISPORT(mode: int) -> int: ...
def S_ISWHT(mode: int) -> int: ...
def filemode(mode: int) -> str: ...

ST_MODE: Literal[0]
ST_INO: Literal[1]
ST_DEV: Literal[2]
ST_NLINK: Literal[3]
ST_UID: Literal[4]
ST_GID: Literal[5]
ST_SIZE: Literal[6]
ST_ATIME: Literal[7]
ST_MTIME: Literal[8]
ST_CTIME: Literal[9]

S_IFIFO: Literal[0o010000]
S_IFLNK: Literal[0o120000]
S_IFREG: Literal[0o100000]
S_IFSOCK: Literal[0o140000]
S_IFBLK: Literal[0o060000]
S_IFCHR: Literal[0o020000]
S_IFDIR: Literal[0o040000]

# These are 0 on systems that don't support the specific kind of file.
# Example: Linux doesn't support door files, so S_IFDOOR is 0 on linux.
S_IFDOOR: int
S_IFPORT: int
S_IFWHT: int

S_ISUID: Literal[0o4000]
S_ISGID: Literal[0o2000]
S_ISVTX: Literal[0o1000]

S_IRWXU: Literal[0o0700]
S_IRUSR: Literal[0o0400]
S_IWUSR: Literal[0o0200]
S_IXUSR: Literal[0o0100]

S_IRWXG: Literal[0o0070]
S_IRGRP: Literal[0o0040]
S_IWGRP: Literal[0o0020]
S_IXGRP: Literal[0o0010]

S_IRWXO: Literal[0o0007]
S_IROTH: Literal[0o0004]
S_IWOTH: Literal[0o0002]
S_IXOTH: Literal[0o0001]

S_ENFMT: Literal[0o2000]
S_IREAD: Literal[0o0400]
S_IWRITE: Literal[0o0200]
S_IEXEC: Literal[0o0100]

UF_APPEND: Literal[0x00000004]
UF_COMPRESSED: Literal[0x00000020]  # OS X 10.6+ only
UF_HIDDEN: Literal[0x00008000]  # OX X 10.5+ only
UF_IMMUTABLE: Literal[0x00000002]
UF_NODUMP: Literal[0x00000001]
UF_NOUNLINK: Literal[0x00000010]
UF_OPAQUE: Literal[0x00000008]

SF_APPEND: Literal[0x00040000]
SF_ARCHIVED: Literal[0x00010000]
SF_IMMUTABLE: Literal[0x00020000]
SF_NOUNLINK: Literal[0x00100000]
SF_SNAPSHOT: Literal[0x00200000]

FILE_ATTRIBUTE_ARCHIVE: Literal[32]
FILE_ATTRIBUTE_COMPRESSED: Literal[2048]
FILE_ATTRIBUTE_DEVICE: Literal[64]
FILE_ATTRIBUTE_DIRECTORY: Literal[16]
FILE_ATTRIBUTE_ENCRYPTED: Literal[16384]
FILE_ATTRIBUTE_HIDDEN: Literal[2]
FILE_ATTRIBUTE_INTEGRITY_STREAM: Literal[32768]
FILE_ATTRIBUTE_NORMAL: Literal[128]
FILE_ATTRIBUTE_NOT_CONTENT_INDEXED: Literal[8192]
FILE_ATTRIBUTE_NO_SCRUB_DATA: Literal[131072]
FILE_ATTRIBUTE_OFFLINE: Literal[4096]
FILE_ATTRIBUTE_READONLY: Literal[1]
FILE_ATTRIBUTE_REPARSE_POINT: Literal[1024]
FILE_ATTRIBUTE_SPARSE_FILE: Literal[512]
FILE_ATTRIBUTE_SYSTEM: Literal[4]
FILE_ATTRIBUTE_TEMPORARY: Literal[256]
FILE_ATTRIBUTE_VIRTUAL: Literal[65536]

if sys.platform == "win32" and sys.version_info >= (3, 8):
    IO_REPARSE_TAG_SYMLINK: int
    IO_REPARSE_TAG_MOUNT_POINT: int
    IO_REPARSE_TAG_APPEXECLINK: int

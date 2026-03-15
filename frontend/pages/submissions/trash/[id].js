import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function SubmissionsTrashPage() {
    const router = useRouter();
    const { id } = router.query;

    useEffect(() => {
        if (id) {
            router.replace(`/submissions/${id}`);
        }
    }, [id, router]);

    return null;
}
